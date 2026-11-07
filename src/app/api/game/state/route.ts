// GET /api/game/state?token=... → snapshot
import { buildSnapshot } from '@/lib/game/server/snapshot'
import { boot, bad, ok } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  boot()
  try {
    const token = new URL(req.url).searchParams.get('token')
    return ok(await buildSnapshot(token))
  } catch (e) {
    return bad(e, 500)
  }
}
