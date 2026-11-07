'use client'

// ─── $WIF burn dialog — real onchain burn on Robinhood Chain ────────────────
import { useState } from 'react'
import { useEscape } from './useEscape'
import { useGame } from '@/lib/game/store'
import { apiWifVerify } from '@/lib/game/api'
import { burnWif, ensureRobinhoodChain, hasWallet } from '@/lib/game/wallet'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const KIND_META = {
  speedup: { icon: '⚡', title: 'INSTANT FINISH', desc: 'Finish construction or training in this city right now.', price: 3 },
  airlift: { icon: '🪂', title: 'AIRLIFT REINFORCEMENT', desc: 'Instantly drop 400 elite troops into this city.', price: 5 },
  shock: { icon: '🔥', title: 'SHOCK & AWE', desc: 'Your next strike attacks at 2× power for 10 minutes.', price: 2 },
} as const

export default function WifDialog() {
  const wifAction = useGame((s) => s.ui.wifAction)
  const setUi = useGame((s) => s.setUi)
  const player = useGame((s) => s.player)
  const chain = useGame((s) => s.chain)
  const token = useGame((s) => s.token)
  const applySnapshot = useGame((s) => s.applySnapshot)
  const meta = wifAction ? KIND_META[wifAction.kind] : null
  const [phase, setPhase] = useState<'idle' | 'wallet' | 'verify'>('idle')

  useEscape(!!wifAction, close)

  if (!wifAction || !meta) return null

  const wifAddress = chain?.wif?.address ?? '0x5173b8ea6923c2d40267890d45c46a3480954773'
  const chainName = chain?.chainName ?? 'Robinhood Chain'

  async function execute() {
    if (!token || !wifAction) return
    if (player?.isGuest || !hasWallet()) {
      toast.error('connect a wallet first — guests cannot burn $WIF')
      return
    }
    setPhase('wallet')
    try {
      await ensureRobinhoodChain()
      const txHash = await burnWif(wifAddress, meta.price)
      setPhase('verify')
      const r = await apiWifVerify(token, wifAction.kind, wifAction.cityId, txHash)
      if (r.snapshot) applySnapshot(r.snapshot, { keepSelection: true })
      toast.success(`🔥 burned ${r.burned.toFixed(2)} $WIF — ${r.effect}`)
      setUi({ wifAction: null })
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'burn failed')
    } finally {
      setPhase('idle')
    }
  }

  function close() { setUi({ wifAction: null }) }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={close}>
      <div className="w-full max-w-sm rounded-lg border border-lime-400/30 bg-[#0c0e0a] p-4 font-mono shadow-2xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="burn wif">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base tracking-widest text-lime-400">
            {meta.icon} {meta.title}
          </h3>
          <button className="text-zinc-500 hover:text-zinc-200" onClick={close}>✕</button>
        </div>

        <p className="mb-3 text-xs leading-relaxed text-zinc-400">{meta.desc}</p>

        <div className="mb-3 rounded-md border border-red-400/30 bg-red-500/5 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-zinc-400">burn (send to 0x…dEaD)</span>
            <span className="text-lg font-bold text-red-400">{meta.price} $WIF</span>
          </div>
          <div className="mt-1.5 truncate text-[10px] text-zinc-500">
            real transaction on {chainName} · gas paid in ETH
          </div>
        </div>

        <div className="mb-3 rounded-md border border-zinc-800 bg-black/40 p-2.5 text-[10px] leading-relaxed text-zinc-500">
          🔥 every $WIF this game collects is burned onchain forever — same spirit as hackathon voting.
          Your burn is verified on Robinhood Chain before the effect applies.
        </div>

        {player?.isGuest ? (
          <div className="rounded-md border border-amber-400/40 bg-amber-400/10 p-2.5 text-center text-[11px] text-amber-300">
            you are a guest — link a wallet (top bar) to burn $WIF
          </div>
        ) : (
          <Button
            disabled={phase !== 'idle' || !hasWallet()}
            onClick={execute}
            className="h-10 w-full bg-lime-400 font-mono text-sm font-bold text-black hover:bg-lime-300"
          >
            {phase === 'wallet' ? 'confirm in wallet…' : phase === 'verify' ? 'verifying onchain…' : `🔥 BURN ${meta.price} $WIF`}
          </Button>
        )}
        {!hasWallet() && (
          <div className="mt-2 text-center text-[10px] text-zinc-500">no EVM wallet detected in this browser</div>
        )}
      </div>
    </div>
  )
}
