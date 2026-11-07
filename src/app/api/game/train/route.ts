// POST /api/game/train — { token, cityId, amount } → snapshot
import { db } from '@/lib/game/server/db'
import { auth } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { TRAIN } from '@/lib/game/server/constants'
import type { TrainTask } from '@/lib/game/server/engine'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ token?: string; cityId?: string; amount?: number }>(req)
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
    return ok(await buildSnapshot(p.token))
  } catch (e) {
    return bad(e)
  }
}
