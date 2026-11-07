// ─── Auth: wallet signature login + guest mode ──────────────────────────────
import { ethers } from 'ethers'
import { db } from './constants'

const nonces = new Map<string, { nonce: string; expires: number }>()

export function makeNonce(address: string): string {
  const nonce = `FLAT WAR login\naddress: ${address.toLowerCase()}\nnonce: ${Math.random().toString(36).slice(2)}${Date.now()}`
  nonces.set(address.toLowerCase(), { nonce, expires: Date.now() + 10 * 60_000 })
  if (nonces.size > 5000) {
    for (const [k, v] of nonces) if (v.expires < Date.now()) nonces.delete(k)
  }
  return nonce
}

function randomToken() {
  return crypto.randomUUID() + '-' + crypto.randomUUID()
}

function sanitizeName(raw: string, fallback: string): string {
  const name = (raw || '').replace(/[^\p{L}\p{N} _.-]/gu, '').trim().slice(0, 20)
  return name.length >= 2 ? name : fallback
}

export async function verifySignature(address: string, signature: string, name?: string) {
  const key = (address || '').toLowerCase()
  const entry = nonces.get(key)
  if (!entry || entry.expires < Date.now()) throw new Error('nonce expired — request a new one')
  const signer = ethers.verifyMessage(entry.nonce, signature).toLowerCase()
  if (signer !== key) throw new Error('signature mismatch')
  nonces.delete(key)

  const addr = key
  let player = await db.player.findUnique({ where: { address: addr } })
  if (!player) {
    const short = addr.slice(0, 6) + '…' + addr.slice(-4)
    player = await db.player.create({
      data: {
        address: addr,
        name: sanitizeName(name, `CMDR ${short}`),
        token: randomToken(),
        tokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
      },
    })
  } else {
    if (name) {
      const cleaned = sanitizeName(name, player.name)
      if (cleaned !== player.name) player = await db.player.update({ where: { id: player.id }, data: { name: cleaned } })
    }
    player = await db.player.update({
      where: { id: player.id },
      data: { token: randomToken(), tokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600_000) },
    })
  }
  return player
}

export async function createGuest(name?: string) {
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase()
  const player = await db.player.create({
    data: {
      address: `guest:${crypto.randomUUID()}`,
      name: sanitizeName(name, `GUEST ${suffix}`),
      token: randomToken(),
      tokenExpiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
    },
  })
  return player
}

export async function auth(token?: string | null) {
  if (!token) return null
  const player = await db.player.findFirst({
    where: { token, tokenExpiresAt: { gt: new Date() } },
  })
  if (player) {
    db.player.update({ where: { id: player.id }, data: { lastSeenAt: new Date() } }).catch(() => {})
  }
  return player
}
