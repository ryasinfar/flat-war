// ─── Flat War engine: tick loop, production, battles ────────────────────────
import { db, TICK_MS, RATE, BUILD, TRAIN, START, MILITIA, COMBAT } from './constants'

export interface BuildTask { kind: string; targetLevel: number; readyAt: number }
export interface TrainTask { amount: number; readyAt: number }

export const rnd = (a: number, b: number) => a + Math.random() * (b - a)
export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n))

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export function attackDistanceKm(from: { lat: number; lon: number }, to: { lat: number; lon: number }) {
  // wrap-around across the antimeridian (world is flat, but let's be kind)
  const d1 = haversineKm(from.lat, from.lon, to.lat, to.lon)
  const shiftedLon = to.lon > 0 ? to.lon - 360 : to.lon + 360
  const d2 = haversineKm(from.lat, from.lon, to.lat, shiftedLon)
  return Math.min(d1, d2)
}

export function travelSeconds(km: number) {
  return Math.round(COMBAT.travelBaseSec + km * COMBAT.travelSecPerKm)
}

export function defensePower(city: {
  troops: number
  bunkerLevel: number
  isCapital: boolean
}) {
  return (
    city.troops *
    (1 + COMBAT.defenseBunkerBonus * city.bunkerLevel) *
    (city.isCapital ? COMBAT.capitalDefenseBonus : 1)
  )
}

export async function addEvent(kind: string, text: string) {
  try {
    const ev = await db.gameEvent.create({ data: { kind, text } })
    // keep feed bounded
    const count = await db.gameEvent.count()
    if (count > 300) {
      const old = await db.gameEvent.findMany({ orderBy: { id: 'asc' }, take: count - 300 })
      if (old.length) await db.gameEvent.deleteMany({ where: { id: { in: old.map((o) => o.id) } } })
    }
    return ev
  } catch {
    return null
  }
}

export function cityLabel(name: string, country: string) {
  return `${name} (${country})`
}

// ─── battle resolution ───────────────────────────────────────────────────────
export async function resolveBattle(battleId: string) {
  const battle = await db.battle.findUnique({ where: { id: battleId } })
  if (!battle || battle.status === 'done') return null
  if (battle.arriveAt.getTime() > Date.now()) return null

  const target = await db.city.findUnique({ where: { id: battle.toCityId } })
  const from = await db.city.findUnique({ where: { id: battle.fromCityId } })
  const attacker = await db.player.findUnique({ where: { id: battle.attackerId } })
  if (!target || !attacker) {
    await db.battle.update({ where: { id: battle.id }, data: { status: 'done', result: 'fizzled' } })
    return null
  }

  // target may have changed owner since launch — defender is whoever holds it now
  let defender: { id: string; name: string } | null = null
  if (target.ownerId) {
    defender = await db.player.findUnique({ where: { id: target.ownerId } })
  }

  const atkPower = battle.troopsSent * (attacker.shockUntil && attacker.shockUntil.getTime() > Date.now() ? COMBAT.shockMultiplier : 1) * rnd(1 - COMBAT.variance, 1 + COMBAT.variance)
  const defPower = defensePower(target) * rnd(1 - COMBAT.variance, 1 + COMBAT.variance)
  const won = atkPower > defPower

  const log = {
    attacker: attacker.name,
    defender: defender?.name ?? 'Local Militia',
    city: cityLabel(target.name, target.country),
    troopsSent: Math.round(battle.troopsSent),
    defenders: Math.round(target.troops),
    atkPower: Math.round(atkPower),
    defPower: Math.round(defPower),
    atkLosses: 0,
    defLosses: 0,
    shock: !!(attacker.shockUntil && attacker.shockUntil.getTime() > Date.now()),
    capitalBonus: target.isCapital,
  }

  let result: string
  const changedCityIds: string[] = []

  if (won) {
    const defLosses = Math.round(target.troops)
    const atkLosses = Math.min(battle.troopsSent, Math.round(defPower / rnd(...COMBAT.winLossRate)))
    const survivors = Math.max(0, Math.round((battle.troopsSent - atkLosses) * COMBAT.occupyKeepRatio))
    const wasPlayerCity = !!target.ownerId && !!defender

    await db.city.update({
      where: { id: target.id },
      data: {
        ownerId: attacker.id,
        troops: survivors,
        isCapital: false, // captured capitals lose capital status
        buildTask: null,
        trainTask: null,
        // industry is partially sabotaged in the fight
        mineLevel: Math.max(0, target.mineLevel - 1),
        derrickLevel: Math.max(0, target.derrickLevel - 1),
        factoryLevel: Math.max(0, target.factoryLevel - 1),
        barracksLevel: Math.max(0, target.barracksLevel - 1),
      },
    })
    changedCityIds.push(target.id)

    // if a capital got taken, the defeated player loses capital status (can rebuild by capturing a new city or via event) — keep simple
    result = 'captured'
    log.atkLosses = atkLosses
    log.defLosses = defLosses
    await addEvent(
      'capture',
      `⚔️ ${attacker.name} ${wasPlayerCity ? 'stormed' : 'seized'} ${cityLabel(target.name, target.country)}${wasPlayerCity ? ` from ${defender?.name}` : ''}`
    )
  } else {
    const defLosses = Math.min(target.troops, Math.round(atkPower / rnd(1.2, 1.6)))
    const atkLosses = battle.troopsSent
    const retreat = Math.round(battle.troopsSent * COMBAT.retreatRatio)
    await db.city.update({
      where: { id: target.id },
      data: { troops: Math.max(0, target.troops - defLosses) },
    })
    changedCityIds.push(target.id)
    if (from && from.ownerId === attacker.id) {
      await db.city.update({
        where: { id: from.id },
        data: { troops: from.troops + retreat },
      })
      changedCityIds.push(from.id)
    }
    result = 'repelled'
    log.atkLosses = atkLosses
    log.defLosses = defLosses
    await addEvent(
      'battle',
      `🛡️ ${defender?.name ?? 'Militia'} repelled ${attacker.name}'s assault on ${cityLabel(target.name, target.country)}`
    )
  }

  // consume shock boost on first battle
  if (attacker.shockUntil && attacker.shockUntil.getTime() > Date.now()) {
    await db.player.update({ where: { id: attacker.id }, data: { shockUntil: null } })
  }

  const done = await db.battle.update({
    where: { id: battle.id },
    data: { status: 'done', result, log: JSON.stringify(log) },
  })
  return { battle: done, changedCityIds, log }
}

// ─── production tick ─────────────────────────────────────────────────────────
export async function runTick(): Promise<{
  changedCityIds: string[]
  tick: number
  resolved: NonNullable<Awaited<ReturnType<typeof resolveBattle>>>[]
}> {
  const state = await db.gameState.upsert({
    where: { id: 'main' },
    create: { id: 'main', tick: 0 },
    update: { tick: { increment: 1 } },
  })
  const changedCityIds: string[] = []

  const cities = await db.city.findMany()
  const now = Date.now()

  // collect player resource deltas
  const deltas = new Map<string, { iron: number; oil: number; ammo: number }>()

  for (const city of cities) {
    const patch: Record<string, unknown> = {}

    // construction completion
    if (city.buildTask) {
      try {
        const task = JSON.parse(city.buildTask) as BuildTask
        if (task.readyAt <= now) {
          const lvlKey = `${task.kind}Level` as keyof typeof city
          const cur = Number(city[lvlKey] ?? 0)
          if (cur + 1 === task.targetLevel) {
            patch[`${task.kind}Level`] = task.targetLevel
          }
          patch.buildTask = null
        }
      } catch { /* ignore */ }
    }

    // training completion
    if (city.trainTask && city.ownerId) {
      try {
        const task = JSON.parse(city.trainTask) as TrainTask
        if (task.readyAt <= now) {
          patch.troops = city.troops + task.amount
          patch.trainTask = null
        }
      } catch { /* ignore */ }
    }

    if (Object.keys(patch).length) {
      await db.city.update({ where: { id: city.id }, data: patch })
      changedCityIds.push(city.id)
      city.buildTask = (patch.buildTask === null ? null : city.buildTask) as string | null
      city.trainTask = (patch.trainTask === null ? null : city.trainTask) as string | null
      if (typeof patch.troops === 'number') city.troops = patch.troops
      for (const k of ['mineLevel', 'derrickLevel', 'factoryLevel', 'barracksLevel', 'bunkerLevel'] as const) {
        if (typeof patch[k] === 'number') (city as unknown as Record<string, number>)[k] = patch[k] as number
      }
    }

    if (!city.ownerId) {
      // neutral militia slowly regrows
      const base = MILITIA[city.tier] ?? 100
      if (city.troops < base) {
        const t = Math.min(base, city.troops + RATE.neutralRegen)
        await db.city.update({ where: { id: city.id }, data: { troops: t } })
        changedCityIds.push(city.id)
      }
      continue
    }

    // owned city production
    let d = deltas.get(city.ownerId)
    if (!d) { d = { iron: 0, oil: 0, ammo: 0 }; deltas.set(city.ownerId, d) }
    d.iron += city.mineLevel * RATE.minePerLevel
    d.oil += city.derrickLevel * RATE.derrickPerLevel

    const ammoCap = city.factoryLevel * RATE.factoryAmmoPerLevel
    if (ammoCap > 0) {
      const wantIron = ammoCap * RATE.factoryIronPerAmmo
      const wantOil = ammoCap * RATE.factoryOilPerAmmo
      const feasible = Math.min(
        ammoCap,
        Math.floor(d.iron / RATE.factoryIronPerAmmo),
        Math.floor(d.oil / RATE.factoryOilPerAmmo)
      )
      // factory consumes from this tick's raw production first (lazy accounting)
      d.iron -= Math.min(d.iron, feasible * RATE.factoryIronPerAmmo)
      d.oil -= Math.min(d.oil, feasible * RATE.factoryOilPerAmmo)
      d.ammo += feasible
      void wantIron
      void wantOil
    }
  }

  for (const [playerId, d] of deltas) {
    await db.player.update({
      where: { id: playerId },
      data: {
        iron: { increment: d.iron },
        oil: { increment: d.oil },
        ammo: { increment: d.ammo },
      },
    })
  }

  // resolve due battles
  const due = await db.battle.findMany({
    where: { status: 'inflight', arriveAt: { lte: new Date(now) } },
    take: 50,
  })
  const resolved: Awaited<ReturnType<typeof resolveBattle>>[] = []
  for (const b of due) {
    const r = await resolveBattle(b.id)
    if (r) resolved.push(r)
  }

  // shock expiry cleanup (lazy)
  await db.player.updateMany({
    where: { shockUntil: { lt: new Date(now) } },
    data: { shockUntil: null },
  })

  return { changedCityIds: [...new Set(changedCityIds)], tick: state.tick, resolved }
}

export function startLoop(
  onTick: (r: {
    tick: number
    changedCityIds: string[]
    resolved: NonNullable<Awaited<ReturnType<typeof resolveBattle>>>[]
  }) => void
) {
  let running = true
  const loop = async () => {
    await new Promise((res) => setTimeout(res, 2000)) // let server settle before first tick
    while (running) {
      try {
        const r = await runTick()
        onTick(r)
      } catch (e) {
        console.error('[engine] tick error', e)
      }
      await new Promise((res) => setTimeout(res, TICK_MS))
    }
  }
  void loop()
  return () => { running = false }
}
