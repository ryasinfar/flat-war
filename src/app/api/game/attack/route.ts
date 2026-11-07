// POST /api/game/attack — { token, fromCityId, toCityId, troops } → { battleId, arriveAt, travelSec, ammoCost }
import { db } from '@/lib/game/server/db'
import { auth } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { attackDistanceKm, travelSeconds, addEvent, cityLabel } from '@/lib/game/server/engine'
import { COMBAT } from '@/lib/game/server/constants'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ token?: string; fromCityId?: string; toCityId?: string; troops?: number }>(req)
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
        fromCityId: from.id,
        toCityId: to.id,
        attackerId: player.id,
        defenderId: to.ownerId,
        troopsSent: n,
        ammoSpent: ammoCost,
        arriveAt,
      },
    })
    await db.city.update({ where: { id: from.id }, data: { troops: from.troops - n } })
    await db.player.update({ where: { id: player.id }, data: { ammo: { decrement: ammoCost } } })
    await addEvent('battle', `🚀 ${player.name} launched a strike on ${cityLabel(to.name, to.country)} — ${n} troops, ${Math.round(dist)} km`)

    return ok({
      battleId: battle.id,
      arriveAt: arriveAt.toISOString(),
      travelSec: travelSeconds(dist),
      ammoCost: Math.ceil(ammoCost),
      snapshot: await buildSnapshot(p.token),
    })
  } catch (e) {
    return bad(e)
  }
}
