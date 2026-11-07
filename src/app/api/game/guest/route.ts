// POST /api/game/guest — { name } → snapshot
import { createGuest } from '@/lib/game/server/auth'
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const p = await readBody<{ name?: string }>(req)
    const player = await createGuest(p?.name)
    return ok(await buildSnapshot(player.token))
  } catch (e) {
    return bad(e)
  }
}
