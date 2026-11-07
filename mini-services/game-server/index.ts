// ─── Flat War game server — socket.io API (gateway-proven pattern) ──────────
import { createServer } from 'http'
import { Server } from 'socket.io'
import {
  db, CHAIN, WIF, BURN_ADDRESS, WIF_PRICES, TRAIN,
  START, MILITIA, COMBAT, AIRLIFT_TROOPS, BUILD,
} from './constants'
import { makeNonce, verifySignature, createGuest, auth } from './auth'
import { verifyBurn } from './wif'
import {
  runTick, startLoop, addEvent, attackDistanceKm, travelSeconds,
  cityLabel, type BuildTask, type TrainTask,
} from './engine'

const PORT = 3003

type Ack = (r: { ok: boolean; data?: unknown; error?: string }) => void

// ─── seed ────────────────────────────────────────────────────────────────────
async function seed() {
  await db.gameState.upsert({
    where: { id: 'main' },
    create: { id: 'main', tick: 0 },
    update: {},
  })
  const count = await db.city.count()
  if (count > 0) return
  const raw = await Bun.file(new URL('./seed/cities.json', import.meta.url)).json()
  await db.city.createMany({
    data: raw.map((c: { id: string; name: string; country: string; cc: string; lat: number; lon: number; tier: number }) => ({
      id: c.id,
      name: c.name,
      country: c.country,
      countryCode: c.cc,
      lat: c.lat,
      lon: c.lon,
      tier: c.tier,
      troops: MILITIA[c.tier] ?? 100,
    })),
  })
  await addEvent('system', `🌍 Season 1 begins — ${raw.length} cities up for grabs. Claim your capital.`)
  console.log(`[seed] ${raw.length} cities created`)
}

// ─── public shapes ───────────────────────────────────────────────────────────
function publicPlayer(p: {
  id: string; address: string; name: string; iron: number; oil: number; ammo: number; shockUntil: Date | null; wifSpent: number
}) {
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
  }
}

function publicCity(c: {
  id: string; name: string; country: string; countryCode: string; lat: number; lon: number; tier: number;
  ownerId: string | null; isCapital: boolean; troops: number; mineLevel: number; derrickLevel: number;
  factoryLevel: number; barracksLevel: number; bunkerLevel: number; buildTask: string | null; trainTask: string | null
}) {
  return {
    id: c.id, name: c.name, country: c.country, cc: c.countryCode,
    lat: c.lat, lon: c.lon, tier: c.tier,
    ownerId: c.ownerId, isCapital: c.isCapital,
    troops: Math.round(c.troops),
    b: { mine: c.mineLevel, derrick: c.derrickLevel, factory: c.factoryLevel, barracks: c.barracksLevel, bunker: c.bunkerLevel },
    buildTask: c.buildTask ? JSON.parse(c.buildTask) : null,
    trainTask: c.trainTask ? JSON.parse(c.trainTask) : null,
  }
}

async function leaderboard() {
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

async function snapshot(token?: string | null) {
  const [player, cities, battles, events, gameState, top] = await Promise.all([
    token ? auth(token) : Promise.resolve(null),
    db.city.findMany(),
    db.battle.findMany({ where: { status: 'inflight' } }),
    db.gameEvent.findMany({ orderBy: { id: 'desc' }, take: 40 }),
    db.gameState.findUnique({ where: { id: 'main' } }),
    leaderboard(),
  ])
  const playerNames = await db.player.findMany({ select: { id: true, name: true } })
  return {
    player: player ? { ...publicPlayer(player), token: player.token } : null,
    cities: cities.map(publicCity),
    battles: battles.map((b) => ({
      id: b.id, fromCityId: b.fromCityId, toCityId: b.toCityId,
      attackerId: b.attackerId, troops: Math.round(b.troopsSent),
      arriveAt: b.arriveAt.toISOString(),
      createdAt: b.createdAt.toISOString(),
    })),
    events,
    gameState: {
      tick: gameState?.tick ?? 0,
      wifBurned: gameState?.wifBurned ?? 0,
      seasonStart: gameState?.seasonStart?.toISOString() ?? null,
    },
    leaderboard: top,
    playerNames: Object.fromEntries(playerNames.map((p) => [p.id, p.name])),
    chain: { ...CHAIN, wif: WIF, burn: BURN_ADDRESS, prices: WIF_PRICES },
  }
}

// ─── server ──────────────────────────────────────────────────────────────────
const httpServer = createServer()

const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

const fail = (e: unknown) => ({ ok: false, error: e instanceof Error ? e.message : String(e) })

io.on('connection', (socket) => {
  console.log(`[ws] connected ${socket.id}`)
  socket.emit('hello', { ts: Date.now(), chain: CHAIN.chainId, wif: WIF.address, burn: BURN_ADDRESS })

  // ── auth ──
  socket.on('auth:nonce', async (p: { address: string }, ack?: Ack) => {
    try {
      if (!p?.address || !/^0x[0-9a-fA-F]{40}$/.test(p.address)) throw new Error('invalid address')
      ack?.({ ok: true, data: { nonce: makeNonce(p.address) } })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('auth:verify', async (p: { address: string; signature: string; name?: string }, ack?: Ack) => {
    try {
      if (!p?.address || !p?.signature) throw new Error('address and signature required')
      const player = await verifySignature(p.address, p.signature, p.name)
      ack?.({ ok: true, data: await snapshot(player.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('auth:guest', async (p: { name?: string }, ack?: Ack) => {
    try {
      const player = await createGuest(p?.name)
      ack?.({ ok: true, data: await snapshot(player.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('state:get', async (p: { token?: string }, ack?: Ack) => {
    try {
      ack?.({ ok: true, data: await snapshot(p?.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  // ── gameplay ──
  socket.on('me:rename', async (p: { token: string; name: string }, ack?: Ack) => {
    try {
      const player = await auth(p?.token)
      if (!player) throw new Error('unauthorized')
      const cleaned = (p.name || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20)
      if (cleaned.length < 2) throw new Error('name too short')
      await db.player.update({ where: { id: player.id }, data: { name: cleaned } })
      await addEvent('system', `🎖️ ${player.name} is now known as ${cleaned}`)
      ack?.({ ok: true, data: await snapshot(p.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('capital:claim', async (p: { token: string; cityId: string }, ack?: Ack) => {
    try {
      const player = await auth(p?.token)
      if (!player) throw new Error('unauthorized')
      const mine = await db.city.count({ where: { ownerId: player.id } })
      if (mine > 0) throw new Error('you already hold territory')
      const city = await db.city.findUnique({ where: { id: p.cityId } })
      if (!city) throw new Error('city not found')
      if (city.ownerId) throw new Error('city already claimed — pick a free one')
      const caps = await db.city.findMany({ where: { ownerId: { not: null }, isCapital: true } })
      const tooClose = caps.some((c) => attackDistanceKm(c, city) < 600)
      if (tooClose) throw new Error('too close to an enemy capital — pick further away')
      await db.city.update({
        where: { id: city.id },
        data: {
          ownerId: player.id,
          isCapital: true,
          troops: START.capitalTroops,
          mineLevel: START.capitalBuildings.mine,
          derrickLevel: START.capitalBuildings.derrick,
          factoryLevel: START.capitalBuildings.factory,
          barracksLevel: START.capitalBuildings.barracks,
        },
      })
      await addEvent('join', `🏴 ${player.name} established their capital at ${cityLabel(city.name, city.country)}`)
      ack?.({ ok: true, data: await snapshot(p.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('city:build', async (p: { token: string; cityId: string; kind: string }, ack?: Ack) => {
    try {
      const player = await auth(p?.token)
      if (!player) throw new Error('unauthorized')
      if (!BUILD.kinds.includes(p?.kind as (typeof BUILD.kinds)[number])) throw new Error('unknown building')
      const city = await db.city.findUnique({ where: { id: p.cityId } })
      if (!city || city.ownerId !== player.id) throw new Error('not your city')
      if (city.buildTask) throw new Error('construction already in progress here')
      const cur = ({ mine: city.mineLevel, derrick: city.derrickLevel, factory: city.factoryLevel, barracks: city.barracksLevel, bunker: city.bunkerLevel } as Record<string, number>)[p.kind]
      const target = cur + 1
      if (target > BUILD.maxLevel) throw new Error('max level reached')
      const cost = (BUILD.cost as Record<string, (L: number) => { iron: number; oil: number; ammo: number }>)[p.kind](target)
      if (player.iron < cost.iron || player.oil < cost.oil || player.ammo < cost.ammo) {
        throw new Error(`not enough resources — need ${cost.iron} iron, ${cost.oil} oil, ${cost.ammo} ammo`)
      }
      const task: BuildTask = { kind: p.kind, targetLevel: target, readyAt: Date.now() + BUILD.durationSec(target) * 1000 }
      await db.player.update({
        where: { id: player.id },
        data: { iron: { decrement: cost.iron }, oil: { decrement: cost.oil }, ammo: { decrement: cost.ammo } },
      })
      await db.city.update({ where: { id: city.id }, data: { buildTask: JSON.stringify(task) } })
      ack?.({ ok: true, data: await snapshot(p.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('city:train', async (p: { token: string; cityId: string; amount: number }, ack?: Ack) => {
    try {
      const player = await auth(p?.token)
      if (!player) throw new Error('unauthorized')
      const city = await db.city.findUnique({ where: { id: p.cityId } })
      if (!city || city.ownerId !== player.id) throw new Error('not your city')
      if (city.trainTask) throw new Error('training already in progress here')
      const n = Math.max(10, Math.min(1000, Math.floor(p?.amount || 0)))
      const unit = TRAIN.costPer100
      const cost = { iron: (unit.iron * n) / 100, ammo: (unit.ammo * n) / 100, oil: (unit.oil * n) / 100 }
      if (player.iron < cost.iron || player.oil < cost.oil || player.ammo < cost.ammo) {
        throw new Error(`not enough resources — need ${Math.ceil(cost.iron)} iron, ${Math.ceil(cost.ammo)} ammo, ${Math.ceil(cost.oil)} oil`)
      }
      const durSec = TRAIN.baseDurationSec * (1 - TRAIN.levelSpeedup * city.barracksLevel) * (n / 100)
      const task: TrainTask = { amount: n, readyAt: Date.now() + Math.max(10, durSec) * 1000 }
      await db.player.update({
        where: { id: player.id },
        data: { iron: { decrement: cost.iron }, oil: { decrement: cost.oil }, ammo: { decrement: cost.ammo } },
      })
      await db.city.update({ where: { id: city.id }, data: { trainTask: JSON.stringify(task) } })
      ack?.({ ok: true, data: await snapshot(p.token) })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('battle:attack', async (p: { token: string; fromCityId: string; toCityId: string; troops: number }, ack?: Ack) => {
    try {
      const player = await auth(p?.token)
      if (!player) throw new Error('unauthorized')
      const from = await db.city.findUnique({ where: { id: p.fromCityId } })
      const to = await db.city.findUnique({ where: { id: p.toCityId } })
      if (!from || !to) throw new Error('city not found')
      if (from.ownerId !== player.id) throw new Error('not your city')
      if (to.ownerId === player.id) throw new Error("that's your own city")
      if (from.id === to.id) throw new Error('same city')

      const dist = attackDistanceKm(from, to)
      if (dist > COMBAT.maxRangeKm) throw new Error(`target out of range (${Math.round(dist)} km > ${COMBAT.maxRangeKm} km)`)

      const inflight = await db.battle.count({ where: { fromCityId: from.id, status: 'inflight' } })
      if (inflight >= 2) throw new Error('this city already has 2 strikes in the air')

      const n = Math.floor(p?.troops || 0)
      if (n < 10) throw new Error('minimum strike force is 10 troops')
      if (from.troops < n) throw new Error(`only ${Math.floor(from.troops)} troops stationed here`)
      const ammoCost = n * COMBAT.ammoPerTroop
      if (player.ammo < ammoCost) throw new Error(`strike needs ${Math.ceil(ammoCost)} ammo`)

      const arriveAt = new Date(Date.now() + travelSeconds(dist) * 1000)
      const battle = await db.battle.create({
        data: {
          fromCityId: from.id, toCityId: to.id,
          attackerId: player.id,
          defenderId: to.ownerId,
          troopsSent: n, ammoSpent: ammoCost,
          arriveAt,
        },
      })
      await db.city.update({ where: { id: from.id }, data: { troops: from.troops - n } })
      await db.player.update({ where: { id: player.id }, data: { ammo: { decrement: ammoCost } } })
      await addEvent('battle', `🚀 ${player.name} launched a strike on ${cityLabel(to.name, to.country)} — ${n} troops, ${Math.round(dist)} km`)

      io.emit('battle-launch', {
        battle: { id: battle.id, fromCityId: from.id, toCityId: to.id, attackerId: player.id, troops: n, arriveAt: arriveAt.toISOString() },
      })
      io.emit('events', { events: await db.gameEvent.findMany({ orderBy: { id: 'desc' }, take: 40 }) })
      const fresh = await db.city.findUnique({ where: { id: from.id } })
      if (fresh) io.emit('cities-update', { cities: [publicCity(fresh)] })
      const me = await db.player.findUnique({ where: { id: player.id } })
      if (me) io.emit('players-update', { players: [{ id: me.id, name: me.name, iron: Math.floor(me.iron), oil: Math.floor(me.oil), ammo: Math.floor(me.ammo), shockUntil: me.shockUntil?.toISOString() ?? null, wifSpent: me.wifSpent }] })

      ack?.({ ok: true, data: { battleId: battle.id, arriveAt: arriveAt.toISOString(), travelSec: travelSeconds(dist), ammoCost: Math.ceil(ammoCost) } })
    } catch (e) { ack?.(fail(e)) }
  })

  // ── $WIF burn verification ──
  socket.on('wif:verify', async (p: { token: string; kind: string; cityId?: string; txHash: string }, ack?: Ack) => {
    try {
      const player = await auth(p?.token)
      if (!player) throw new Error('unauthorized')
      if (player.address.startsWith('guest:')) throw new Error('guests cannot burn $WIF — connect a wallet')
      if (!p?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(p.txHash)) throw new Error('invalid tx hash')
      const price = (WIF_PRICES as Record<string, number>)[p.kind]
      if (!price) throw new Error('unknown burn kind')

      const burned = await verifyBurn({ txHash: p.txHash, kind: p.kind, playerAddress: player.address })

      await db.wifTx.create({ data: { txHash: p.txHash, playerId: player.id, kind: p.kind, amount: burned } })
      await db.player.update({ where: { id: player.id }, data: { wifSpent: { increment: burned } } })
      await db.gameState.upsert({
        where: { id: 'main' },
        create: { id: 'main', wifBurned: burned },
        update: { wifBurned: { increment: burned } },
      })

      let effectText = ''
      if (p.kind === 'speedup') {
        const city = await db.city.findUnique({ where: { id: p.cityId } })
        if (!city || city.ownerId !== player.id) throw new Error('pick one of your cities')
        const patch: Record<string, unknown> = {}
        if (city.buildTask) {
          const t = JSON.parse(city.buildTask) as BuildTask
          patch.buildTask = JSON.stringify({ ...t, readyAt: Date.now() })
        } else if (city.trainTask) {
          const t = JSON.parse(city.trainTask) as TrainTask
          patch.trainTask = JSON.stringify({ ...t, readyAt: Date.now() })
        } else {
          throw new Error('no active construction or training in this city')
        }
        await db.city.update({ where: { id: city.id }, data: patch })
        effectText = `instant-finished work in ${city.name}`
      } else if (p.kind === 'airlift') {
        const city = await db.city.findUnique({ where: { id: p.cityId } })
        if (!city || city.ownerId !== player.id) throw new Error('pick one of your cities')
        await db.city.update({ where: { id: city.id }, data: { troops: city.troops + AIRLIFT_TROOPS } })
        effectText = `airlifted ${AIRLIFT_TROOPS} troops into ${city.name}`
      } else if (p.kind === 'shock') {
        await db.player.update({ where: { id: player.id }, data: { shockUntil: new Date(Date.now() + COMBAT.shockDurationMs) } })
        effectText = 'SHOCK & AWE armed — next strike hits x2'
      }

      await addEvent('burn', `🔥 ${player.name} burned ${burned.toFixed(2)} $WIF onchain — ${effectText}`)

      const [state, events, city2] = await Promise.all([
        db.gameState.findUnique({ where: { id: 'main' } }),
        db.gameEvent.findMany({ orderBy: { id: 'desc' }, take: 40 }),
        p.cityId ? db.city.findUnique({ where: { id: p.cityId } }) : Promise.resolve(null),
      ])
      io.emit('game-state', { tick: state?.tick ?? 0, wifBurned: state?.wifBurned ?? 0 })
      io.emit('events', { events })
      if (city2) io.emit('cities-update', { cities: [publicCity(city2)] })
      const me = await db.player.findUnique({ where: { id: player.id } })
      if (me) io.emit('players-update', { players: [{ id: me.id, name: me.name, iron: Math.floor(me.iron), oil: Math.floor(me.oil), ammo: Math.floor(me.ammo), shockUntil: me.shockUntil?.toISOString() ?? null, wifSpent: me.wifSpent }] })
      io.emit('leaderboard', { rows: await leaderboard() })

      ack?.({ ok: true, data: { burned, effect: effectText, txHash: p.txHash } })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('leaderboard:get', async (_p: unknown, ack?: Ack) => {
    try {
      ack?.({ ok: true, data: { rows: await leaderboard() } })
    } catch (e) { ack?.(fail(e)) }
  })

  socket.on('disconnect', () => {
    console.log(`[ws] disconnected ${socket.id}`)
  })
})

// ─── engine wiring ───────────────────────────────────────────────────────────
startLoop(async ({ tick, changedCityIds, resolved }) => {
  try {
    if (changedCityIds.length) {
      const cities = await db.city.findMany({ where: { id: { in: changedCityIds } } })
      io.emit('cities-update', { cities: cities.map(publicCity) })
    }
    for (const r of resolved) {
      io.emit('battle-resolved', {
        battleId: r.battle.id,
        result: r.battle.result,
        log: r.log,
        toCityId: r.battle.toCityId,
        fromCityId: r.battle.fromCityId,
      })
      io.emit('events', { events: await db.gameEvent.findMany({ orderBy: { id: 'desc' }, take: 40 }) })
    }
    const players = await db.player.findMany({
      select: { id: true, name: true, iron: true, oil: true, ammo: true, shockUntil: true, wifSpent: true },
    })
    if (players.length) {
      io.emit('players-update', {
        players: players.map((p) => ({
          id: p.id, name: p.name, iron: Math.floor(p.iron), oil: Math.floor(p.oil), ammo: Math.floor(p.ammo),
          shockUntil: p.shockUntil?.toISOString() ?? null, wifSpent: p.wifSpent,
        })),
      })
    }
    const state = await db.gameState.findUnique({ where: { id: 'main' } })
    io.emit('game-state', { tick, wifBurned: state?.wifBurned ?? 0 })
  } catch (e) {
    console.error('[loop emit]', e)
  }
})

// ─── boot ────────────────────────────────────────────────────────────────────
async function main() {
  await seed()
  httpServer.listen(PORT, () => {
    console.log(`[flatwar] game server on :${PORT} — chain ${CHAIN.chainId}, WIF ${WIF.address}`)
  })
}
main().catch((e) => {
  console.error('[boot]', e)
  process.exit(1)
})
