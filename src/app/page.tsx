'use client'

// ─── FLAT WAR — world conquest strategy on Robinhood Chain ──────────────────
import { useEffect } from 'react'
import { useGame, colorForPlayer, wirePolling, syncNow } from '@/lib/game/store'
import { apiNonce, apiVerify } from '@/lib/game/api'
import { connectWallet, ensureRobinhoodChain, signMessage } from '@/lib/game/wallet'
import WarMap from '@/components/game/WarMap'
import TopBar from '@/components/game/TopBar'
import CityPanel from '@/components/game/CityPanel'
import WarFeed from '@/components/game/WarFeed'
import AttackDialog from '@/components/game/AttackDialog'
import WifDialog from '@/components/game/WifDialog'
import Onboarding from '@/components/game/Onboarding'
import BattleReport from '@/components/game/BattleReport'
import { LeaderboardDialog, HelpDialog, ClaimBanner } from '@/components/game/Dialogs'
import { toast } from 'sonner'

export default function Home() {
  const booted = useGame((s) => s.booted)

  // boot: start polling (instant first sync + 2.5s refresh)
  useEffect(() => {
    wirePolling()
  }, [])

  // guest → wallet linking (top bar button dispatches after wallet connect)
  const player = useGame((s) => s.player)
  useEffect(() => {
    const onLink = async () => {
      const st = useGame.getState()
      if (!st.player?.isGuest) return
      try {
        const addr = await connectWallet()
        await ensureRobinhoodChain()
        const nonce = await apiNonce(addr) // ← plain string
        const signature = await signMessage(nonce)
        const snap = await apiVerify(addr, signature, st.player.name)
        st.applySnapshot(snap)
        syncNow()
        toast.success('🔗 wallet linked — $WIF burns unlocked')
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'wallet link failed')
      }
    }
    window.addEventListener('fw-link-wallet', onLink)
    return () => window.removeEventListener('fw-link-wallet', onLink)
  }, [player?.isGuest])

  // auto-exit claim mode once territory held
  const cities = useGame((s) => s.cities)
  const claimMode = useGame((s) => s.ui.claimMode)
  const setUi = useGame((s) => s.setUi)
  useEffect(() => {
    if (player && claimMode && cities.some((c) => c.ownerId === player.id)) {
      setUi({ claimMode: false })
    }
  }, [player, cities, claimMode, setUi])

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#070806]">
      <TopBar />
      <main className="relative flex-1">
        <WarMap />
        {booted && (
          <>
            <ClaimBanner />
            <CityPanel />
            <WarFeed />
            <BattleReport />
            <Onboarding />
            <AttackDialog />
            <WifDialog />
            <LeaderboardDialog />
            <HelpDialog />
          </>
        )}
        {!booted && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse font-display text-xl tracking-[0.3em] text-lime-400">
              CONNECTING TO WAR ROOM…
            </div>
          </div>
        )}
      </main>
      <StatusStrip />
    </div>
  )
}

function StatusStrip() {
  const player = useGame((s) => s.player)
  const cities = useGame((s) => s.cities)
  const gameState = useGame((s) => s.gameState)
  const chain = useGame((s) => s.chain)
  const setUi = useGame((s) => s.setUi)
  const logout = useGame((s) => s.logout)

  const mine = cities.filter((c) => c.ownerId === player?.id)

  return (
    <footer className="mt-auto flex items-center gap-3 overflow-x-auto border-t border-zinc-900 bg-[#0c0e0a] px-3 py-1.5 font-mono text-[10px] text-zinc-500">
      <span className="whitespace-nowrap">
        {chain ? `${chain.chainName} · ${chain.chainId} · ` : ''}${chain ? chain.wif.symbol : 'WIF'} burned: {gameState.wifBurned.toFixed(1)}
      </span>
      <span className="whitespace-nowrap text-zinc-600">|</span>
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {player ? (
          <>
            <span
              className="mr-1 inline-block h-2 w-2 rounded-full"
              style={{ background: colorForPlayer(player.id) }}
            />
            {mine.length > 0 ? (
              mine.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    setUi({ selectedCityId: c.id })
                    window.dispatchEvent(new CustomEvent('fw-fly', { detail: { lat: c.lat, lon: c.lon } }))
                  }}
                  className={`rounded border px-1.5 py-0.5 text-[10px] transition-colors ${
                    useGame.getState().ui.selectedCityId === c.id
                      ? 'border-lime-400/60 bg-lime-400/15 text-lime-300'
                      : 'border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
                  }`}
                  title={`${c.name} — ${Math.round(c.troops)} troops`}
                >
                  {c.isCapital ? '★' : '•'} {c.name}
                </button>
              ))
            ) : (
              'no cities'
            )}
          </>
        ) : (
          'not deployed'
        )}
      </span>
      <span className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
        {player && (
          <button className="text-lime-400/80 hover:text-lime-300" onClick={() => setUi({ wifAction: { kind: 'shock' } })}>
            🔥 SHOCK &amp; AWE (2 $WIF)
          </button>
        )}
        <button className="hover:text-zinc-300" onClick={() => setUi({ showHelp: true })}>help</button>
        {player && (
          <button
            className="hover:text-zinc-300"
            onClick={() => { logout(); toast('logged out — command awaiting a new commander') }}
          >
            exit
          </button>
        )}
      </span>
    </footer>
  )
}
