// POST /api/game/claim — { token, cityId } → snapshot
import { db } from '@/lib/game/server/db'
import { auth } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { attackDistanceKm, addEvent, cityLabel } from '@/lib/game/server/engine'
import { START } from '@/lib/game/server/constants'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ token?: string; cityId?: string }>(req)
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
    return ok(await buildSnapshot(p.token))
  } catch (e) {
    return bad(e)
  }
}
