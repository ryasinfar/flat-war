// POST /api/game/wif — { token, kind, cityId?, txHash } → { burned, effect, txHash, snapshot }
import { db } from '@/lib/game/server/db'
import { auth } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { verifyBurn } from '@/lib/game/server/wif'
import { addEvent } from '@/lib/game/server/engine'
import { WIF_PRICES, COMBAT, AIRLIFT_TROOPS } from '@/lib/game/server/constants'
import type { BuildTask, TrainTask } from '@/lib/game/server/engine'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ token?: string; kind?: string; cityId?: string; txHash?: string }>(req)
    const player = await auth(p?.token)
    if (!player) throw new Error('unauthorized')
    if (player.address.startsWith('guest:')) throw new Error('guests cannot burn $WIF — connect a wallet')
    if (!p?.txHash || !/^0x[0-9a-fA-F]{64}$/.test(p.txHash)) throw new Error('invalid tx hash')
    const price = (WIF_PRICES as Record<string, number>)[p.kind!]
    if (!price) throw new Error('unknown burn kind')

    const burned = await verifyBurn({ txHash: p.txHash, kind: p.kind!, playerAddress: player.address })

    await db.wifTx.create({ data: { txHash: p.txHash, playerId: player.id, kind: p.kind!, amount: burned } })
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

    return ok({
      burned,
      effect: effectText,
      txHash: p.txHash,
      snapshot: await buildSnapshot(p.token),
    })
  } catch (e) {
    return bad(e)
  }
}
