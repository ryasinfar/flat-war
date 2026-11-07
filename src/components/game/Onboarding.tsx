'use client'

// ─── Onboarding: welcome → wallet/guest → capital claim ─────────────────────
import { useState } from 'react'
import { useGame } from '@/lib/game/store'
import { apiGuest, apiNonce, apiVerify } from '@/lib/game/api'
import { connectWallet, ensureRobinhoodChain, signMessage, hasWallet } from '@/lib/game/wallet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

type Phase = 'welcome' | 'wallet-name' | 'guest-name' | 'link-existing'

export default function Onboarding() {
  const player = useGame((s) => s.player)
  const booted = useGame((s) => s.booted)
  const connected = useGame((s) => s.connected)
  const applySnapshot = useGame((s) => s.applySnapshot)
  const setUi = useGame((s) => s.setUi)

  const [phase, setPhase] = useState<Phase>('welcome')
  const [name, setName] = useState('')
  const [walletAddr, setWalletAddr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  if (!booted || !connected || player) return null

  async function startWallet() {
    setErr(null)
    if (!hasWallet()) {
      setErr('No EVM wallet found in this browser. Install MetaMask, or play as guest.')
      return
    }
    setBusy(true)
    try {
      const addr = await connectWallet()
      await ensureRobinhoodChain()
      setWalletAddr(addr)
      setPhase('wallet-name')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'wallet connection failed')
    } finally {
      setBusy(false)
    }
  }

  async function finishWallet() {
    if (!walletAddr) return
    setBusy(true)
    setErr(null)
    try {
      // apiNonce returns the sign-in message string directly
      const nonce = await apiNonce(walletAddr)
      const signature = await signMessage(nonce)
      const snap = await apiVerify(walletAddr, signature, name)
      applySnapshot(snap)
      useGame.getState().setUi({ claimMode: true })
      toast.success('commander verified onchain — now claim your capital!')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'login failed')
    } finally {
      setBusy(false)
    }
  }

  async function finishGuest() {
    setBusy(true)
    setErr(null)
    try {
      const snap = await apiGuest(name)
      applySnapshot(snap)
      setUi({ claimMode: true })
      toast.success('welcome, commander — claim your capital!')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'could not start')
    } finally {
      setBusy(false)
    }
  }

  async function linkExisting() {
    setErr(null)
    if (!hasWallet()) { setErr('No EVM wallet found.'); return }
    setBusy(true)
    try {
      const addr = await connectWallet()
      await ensureRobinhoodChain()
      setWalletAddr(addr)
      setPhase('wallet-name')
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'wallet error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur">
      <div className="w-full max-w-md rounded-xl border border-lime-400/25 bg-[#0c0e0a] p-6 font-mono shadow-2xl">
        {phase === 'welcome' && (
          <>
            <div className="mb-1 text-center text-4xl">🌍⚔️</div>
            <h1 className="text-center font-display text-3xl tracking-[0.25em] text-lime-400">FLAT WAR</h1>
            <p className="mt-1 text-center text-[11px] uppercase tracking-[0.3em] text-zinc-500">
              season 1 · robinhood chain
            </p>
            <p className="mx-auto mt-4 max-w-sm text-center text-xs leading-relaxed text-zinc-400">
              claim a city. build mines, derricks and factories. raise an army.
              strike your neighbours — take the whole flat world.
              burn <span className="text-lime-400">$WIF</span> for power.
            </p>
            <div className="mt-6 space-y-2.5">
              <Button onClick={startWallet} disabled={busy}
                className="h-11 w-full bg-lime-400 font-mono text-sm font-bold text-black hover:bg-lime-300">
                {busy ? 'connecting…' : '🔗 CONNECT WALLET'}
              </Button>
              <Button onClick={() => setPhase('guest-name')} variant="outline"
                className="h-11 w-full border-zinc-700 font-mono text-sm text-zinc-300 hover:bg-zinc-900">
                🎖 PLAY AS GUEST
              </Button>
            </div>
            {err && <p className="mt-3 text-center text-[11px] text-red-400">{err}</p>}
            <p className="mt-4 text-center text-[10px] leading-relaxed text-zinc-600">
              playing is free. $WIF burns are optional boosts, never required.
              wallet login is a signature — we never take custody.
            </p>
          </>
        )}

        {(phase === 'wallet-name' || phase === 'guest-name') && (
          <>
            <h2 className="font-display text-xl tracking-widest text-lime-400">
              {phase === 'wallet-name' ? 'COMMANDER REGISTRATION' : 'CALLSIGN'}
            </h2>
            {phase === 'wallet-name' && (
              <p className="mt-1 truncate text-[11px] text-zinc-500">
                wallet: <span className="text-zinc-300">{walletAddr}</span>
              </p>
            )}
            <label className="mt-4 block text-[10px] uppercase tracking-widest text-zinc-500">commander name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. PERSIAN GULF"
              maxLength={20}
              className="mt-1 h-10 border-zinc-700 bg-black/60 font-mono"
            />
            {err && <p className="mt-2 text-[11px] text-red-400">{err}</p>}
            <div className="mt-4 flex gap-2">
              <Button variant="outline" onClick={() => setPhase('welcome')}
                className="h-10 border-zinc-700 font-mono text-xs text-zinc-400">back</Button>
              <Button
                onClick={phase === 'wallet-name' ? finishWallet : finishGuest}
                disabled={busy || name.trim().length < 2}
                className="h-10 flex-1 bg-lime-400 font-mono text-sm font-bold text-black hover:bg-lime-300"
              >
                {busy ? 'signing in…' : phase === 'wallet-name' ? 'SIGN NONCE & ENTER' : 'ENTER THE WAR'}
              </Button>
            </div>
          </>
        )}

        {phase === 'link-existing' && (
          <>
            <h2 className="font-display text-xl tracking-widest text-lime-400">LINK WALLET</h2>
            <p className="mt-2 text-xs text-zinc-400">
              connect the wallet you registered with. you will sign a login message.
            </p>
            {err && <p className="mt-2 text-[11px] text-red-400">{err}</p>}
            <Button onClick={linkExisting} disabled={busy}
              className="mt-4 h-10 w-full bg-lime-400 font-mono text-sm font-bold text-black">
              {busy ? 'connecting…' : 'CONNECT'}
            </Button>
            <Button variant="ghost" onClick={() => setPhase('welcome')}
              className="mt-2 h-8 w-full font-mono text-xs text-zinc-500">back</Button>
          </>
        )}
      </div>
    </div>
  )
}
