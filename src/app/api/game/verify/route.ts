// POST /api/game/verify — { address, signature, name } → snapshot
import { verifySignature } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ address?: string; signature?: string; name?: string }>(req)
    if (!p?.address || !p?.signature) throw new Error('address and signature required')
    const player = await verifySignature(p.address, p.signature, p.name)
    return ok(await buildSnapshot(player.token))
  } catch (e) {
    return bad(e)
  }
}
