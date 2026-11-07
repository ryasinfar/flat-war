// ─── $WIF on-chain burn verification (Robinhood Chain 4663) ──────────────────
import { db, CHAIN, WIF, BURN_ADDRESS, WIF_PRICES } from './constants'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(CHAIN.rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(15_000),
  })
  const json = await res.json()
  if (json.error) throw new Error(`rpc: ${json.error.message}`)
  return json.result as T
}

interface Log {
  address: string
  topics: string[]
  data: string
}

function padAddr(addr: string) {
  return '0x' + addr.toLowerCase().replace(/^0x/, '').padStart(64, '0')
}

export function priceOf(kind: string): number {
  const p = (WIF_PRICES as Record<string, number>)[kind]
  if (!p) throw new Error('unknown burn kind')
  return p
}

/**
 * Verifies a $WIF transfer-to-burn transaction on Robinhood Chain.
 * Returns the burned amount (whole WIF) if valid.
 */
export async function verifyBurn(opts: {
  txHash: string
  kind: string
  playerAddress: string
}): Promise<number> {
  const required = BigInt(priceOf(opts.kind)) * BigInt(10 ** WIF.decimals)

  // already used?
  const dup = await db.wifTx.findUnique({ where: { txHash: opts.txHash } })
  if (dup) throw new Error('this transaction was already submitted')

  const receipt = await rpc<{ status: string; logs: Log[] }>('eth_getTransactionReceipt', [opts.txHash])
  if (!receipt) throw new Error('transaction not found yet — wait a few seconds and retry')
  if (receipt.status !== '0x1') throw new Error('transaction failed on-chain')

  const from = padAddr(opts.playerAddress)
  const to = padAddr(BURN_ADDRESS)
  const wifAddr = WIF.address.toLowerCase()

  let best: bigint | null = null
  for (const log of receipt.logs || []) {
    if (log.address.toLowerCase() !== wifAddr) continue
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length < 3) continue
    if (log.topics[1].toLowerCase() !== from) continue
    if (log.topics[2].toLowerCase() !== to) continue
    const value = BigInt(log.data === '0x' ? '0x0' : log.data)
    if (best === null || value > best) best = value
  }
  if (best === null) {
    throw new Error(`no $WIF transfer to the burn address (0x…dEaD) from your wallet found in this tx`)
  }
  if (best < required) {
    throw new Error(`burned ${Number(best / BigInt(10 ** 14)) / 1e4} WIF but ${priceOf(opts.kind)} WIF is required`)
  }
  return Number(best) / 10 ** WIF.decimals
}
