// POST /api/game/build — { token, cityId, kind } → snapshot
import { db } from '@/lib/game/server/db'
import { auth } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { BUILD } from '@/lib/game/server/constants'
import type { BuildTask } from '@/lib/game/server/engine'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ token?: string; cityId?: string; kind?: string }>(req)
    const player = await auth(p?.token)
    if (!player) throw new Error('unauthorized')
    if (!BUILD.kinds.includes(p?.kind as (typeof BUILD.kinds)[number])) throw new Error('unknown building')
    const city = await db.city.findUnique({ where: { id: p.cityId } })
    if (!city || city.ownerId !== player.id) throw new Error('not your city')
    if (city.buildTask) throw new Error('construction already in progress here')
    const cur = (
      { mine: city.mineLevel, derrick: city.derrickLevel, factory: city.factoryLevel, barracks: city.barracksLevel, bunker: city.bunkerLevel } as Record<string, number>
    )[p.kind!]
    const target = cur + 1
    if (target > BUILD.maxLevel) throw new Error('max level reached')
    const cost = (BUILD.cost as Record<string, (L: number) => { iron: number; oil: number; ammo: number }>)[p.kind!](target)
    if (player.iron < cost.iron || player.oil < cost.oil || player.ammo < cost.ammo) {
      throw new Error(`not enough resources — need ${cost.iron} iron, ${cost.oil} oil, ${cost.ammo} ammo`)
    }
    const task: BuildTask = { kind: p.kind!, targetLevel: target, readyAt: Date.now() + BUILD.durationSec(target) * 1000 }
    await db.player.update({
      where: { id: player.id },
      data: { iron: { decrement: cost.iron }, oil: { decrement: cost.oil }, ammo: { decrement: cost.ammo } },
    })
    await db.city.update({ where: { id: city.id }, data: { buildTask: JSON.stringify(task) } })
    return ok(await buildSnapshot(p.token))
  } catch (e) {
    return bad(e)
  }
}
