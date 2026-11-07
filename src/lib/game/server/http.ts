// ─── API route helpers ───────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { ensureEngine } from './engine'

export async function readBody<T>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    return {} as T
  }
}

export function ok(data: unknown) {
  return NextResponse.json(data, { headers: { 'cache-control': 'no-store' } })
}

export function bad(e: unknown, status = 400) {
  return NextResponse.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status, headers: { 'cache-control': 'no-store' } }
  )
}

/** Every game route boots the engine (seed + tick loop) before doing work. */
export function boot() {
  ensureEngine()
}
