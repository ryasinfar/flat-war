// ─── Flat War snapshot builder (server) ──────────────────────────────────────
import { db } from './db'
import { auth } from './auth'
import { CHAIN, WIF, BURN_ADDRESS, WIF_PRICES } from './constants'
import type { City, PlayerInfo, BattleInfo, GameEvent, LeaderRow, BattleLog, Snapshot, ReportInfo } from '@/lib/game/types'

function publicPlayer(p: {
  id: string
  address: string
  name: string
  iron: number
  oil: number
  ammo: number
  shockUntil: Date | null
  wifSpent: number
  token?: string | null
}): PlayerInfo {
  return {
    id: p.id,
    address: p.address,
    name: p.name,
    iron: Math.floor(p.iron),
    oil: Math.floor(p.oil),
    ammo: Math.floor(p.ammo),
    shockUntil: p.shockUntil?.toISOString() ?? null,
    isGuest: p.address.startsWith('guest:'),
    wifSpent: p.wifSpent,
    token: p.token ?? undefined,
  }
}

function publicCity(
  c: {
    id: string
    name: string
    country: string
    countryCode: string
    lat: number
    lon: number
    tier: number
    ownerId: string | null
    isCapital: boolean
    troops: number
    mineLevel: number
    derrickLevel: number
    factoryLevel: number
    barracksLevel: number
    bunkerLevel: number
    buildTask: string | null
    trainTask: string | null
  }
): City {
  return {
    id: c.id,
    name: c.name,
    country: c.country,
    cc: c.countryCode,
    lat: c.lat,
    lon: c.lon,
    tier: c.tier,
    ownerId: c.ownerId,
    isCapital: c.isCapital,
    troops: Math.round(c.troops),
    b: { mine: c.mineLevel, derrick: c.derrickLevel, factory: c.factoryLevel, barracks: c.barracksLevel, bunker: c.bunkerLevel },
    buildTask: c.buildTask ? JSON.parse(c.buildTask) : null,
    trainTask: c.trainTask ? JSON.parse(c.trainTask) : null,
  }
}

export async function leaderboard(): Promise<LeaderRow[]> {
  const cities = await db.city.findMany({ where: { ownerId: { not: null } }, select: { ownerId: true, troops: true } })
  const players = await db.player.findMany({ select: { id: true, name: true, wifSpent: true } })
  const stats = new Map<string, { cities: number; troops: number }>()
  for (const c of cities) {
    if (!c.ownerId) continue
    const s = stats.get(c.ownerId) ?? { cities: 0, troops: 0 }
    s.cities += 1
    s.troops += c.troops
    stats.set(c.ownerId, s)
  }
  return players
    .map((p) => ({
      id: p.id,
      name: p.name,
      wifSpent: p.wifSpent,
      cities: stats.get(p.id)?.cities ?? 0,
      troops: Math.round(stats.get(p.id)?.troops ?? 0),
      power: (stats.get(p.id)?.cities ?? 0) * 1000 + (stats.get(p.id)?.troops ?? 0),
    }))
    .filter((r) => r.cities > 0)
    .sort((a, b) => b.power - a.power)
    .slice(0, 15)
}

export async function buildSnapshot(token?: string | null): Promise<Snapshot> {
  const [player, cities, battles, events, gameState, top, reportsRaw, playerNames] = await Promise.all([
    token ? auth(token) : Promise.resolve(null),
    db.city.findMany(),
    db.battle.findMany({ where: { status: 'inflight' } }),
    db.gameEvent.findMany({ orderBy: { id: 'desc' }, take: 40 }),
    db.gameState.findUnique({ where: { id: 'main' } }),
    leaderboard(),
    // recent resolved battles (last 30 min) so polling clients can show reports
    db.battle.findMany({
      where: { status: 'done', arriveAt: { gte: new Date(Date.now() - 30 * 60_000) } },
      orderBy: { arriveAt: 'desc' },
      take: 25,
    }),
    db.player.findMany({ select: { id: true, name: true } }),
  ])

  const reports: ReportInfo[] = reportsRaw
    .filter((b) => b.log)
    .map((b) => ({
      id: b.id,
      fromCityId: b.fromCityId,
      toCityId: b.toCityId,
      attackerId: b.attackerId,
      defenderId: b.defenderId,
      result: b.result ?? 'fizzled',
      at: b.arriveAt.toISOString(),
      log: JSON.parse(b.log!) as BattleLog,
    }))

  return {
    player: player
      ? publicPlayer({ ...player, token: player.token })
      : null,
    cities: cities.map(publicCity),
    battles: battles.map((b) => ({
      id: b.id,
      fromCityId: b.fromCityId,
      toCityId: b.toCityId,
      attackerId: b.attackerId,
      troops: Math.round(b.troopsSent),
      arriveAt: b.arriveAt.toISOString(),
      createdAt: b.createdAt.toISOString(),
    })) satisfies BattleInfo[],
    events: events.map((e) => ({ id: e.id, kind: e.kind, text: e.text, createdAt: e.createdAt.toISOString() })) satisfies GameEvent[],
    gameState: {
      tick: gameState?.tick ?? 0,
      wifBurned: gameState?.wifBurned ?? 0,
      seasonStart: gameState?.seasonStart?.toISOString() ?? null,
    },
    leaderboard: top,
    playerNames: Object.fromEntries(playerNames.map((p) => [p.id, p.name])),
    reports,
    chain: { ...CHAIN, wif: WIF, burn: BURN_ADDRESS, prices: WIF_PRICES },
  }
}
