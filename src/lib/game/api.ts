'use client'

// ─── Flat War HTTP transport (works everywhere — sandbox & published) ────────
import type { Snapshot } from './types'

async function post<T>(path: string, body: unknown, timeoutMs = 30000): Promise<T> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      cache: 'no-store',
    })
    const json = await res.json().catch(() => null)
    if (!res.ok) throw new Error((json as { error?: string })?.error || `request failed (${res.status})`)
    return json as T
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error('server timeout — try again')
    throw e
  }
}

export async function apiGuest(name: string) {
  return post<Snapshot>('/api/game/guest', { name })
}

/** Returns the sign-in message (nonce) to be signed by the wallet. */
export async function apiNonce(address: string): Promise<string> {
  const r = await post<{ nonce: string }>('/api/game/nonce', { address })
  return r.nonce
}

export async function apiVerify(address: string, signature: string, name?: string) {
  return post<Snapshot>('/api/game/verify', { address, signature, name })
}

export async function apiState(token?: string | null) {
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  const res = await fetch(`/api/game/state${q}`, { cache: 'no-store' })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error((json as { error?: string })?.error || `state failed (${res.status})`)
  return json as Snapshot
}

export async function apiClaim(token: string, cityId: string) {
  return post<Snapshot>('/api/game/claim', { token, cityId })
}

export async function apiBuild(token: string, cityId: string, kind: string) {
  return post<Snapshot>('/api/game/build', { token, cityId, kind })
}

export async function apiTrain(token: string, cityId: string, amount: number) {
  return post<Snapshot>('/api/game/train', { token, cityId, amount })
}

export async function apiAttack(token: string, fromCityId: string, toCityId: string, troops: number) {
  const r = await post<{
    battleId: string
    arriveAt: string
    travelSec: number
    ammoCost: number
    snapshot: Snapshot
  }>('/api/game/attack', { token, fromCityId, toCityId, troops })
  return r
}

export async function apiWifVerify(token: string, kind: string, cityId: string | undefined, txHash: string) {
  return post<{ burned: number; effect: string; txHash: string; snapshot: Snapshot }>('/api/game/wif', {
    token,
    kind,
    cityId,
    txHash,
  })
}
