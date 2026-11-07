// POST /api/game/nonce — { address } → { nonce }
import { makeNonce } from '@/lib/game/server/auth'
import { boot, bad, ok, readBody } from '@/lib/game/server/http'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  boot()
  try {
    const { address } = await readBody<{ address?: string }>(req)
    if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) throw new Error('invalid address')
    return ok({ nonce: makeNonce(address) })
  } catch (e) {
    return bad(e)
  }
}
