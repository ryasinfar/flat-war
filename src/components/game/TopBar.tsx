'use client'

import { useGame, colorForPlayer } from '@/lib/game/store'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { connectWallet, ensureRobinhoodChain, hasWallet } from '@/lib/game/wallet'
import { useState } from 'react'

export default function TopBar() {
  const player = useGame((s) => s.player)
  const cities = useGame((s) => s.cities)
  const gameState = useGame((s) => s.gameState)
  const connected = useGame((s) => s.connected)
  const setUi = useGame((s) => s.setUi)
  const [linking, setLinking] = useState(false)

  const mine = cities.filter((c) => c.ownerId === player?.id)
  const totalTroops = mine.reduce((a, c) => a + c.troops, 0)
  const shockActive = player?.shockUntil && new Date(player.shockUntil).getTime() > Date.now()

  async function linkWallet() {
    setLinking(true)
    try {
      await connectWallet()
      await ensureRobinhoodChain()
      window.dispatchEvent(new CustomEvent('fw-link-wallet'))
    } catch (e) {
      console.error(e)
      alert(e instanceof Error ? e.message : 'wallet error')
    } finally {
      setLinking(false)
    }
  }

  return (
    <header className="z-30 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-b border-lime-400/20 bg-[#0c0e0a]/95 px-3 py-2 font-mono text-xs sm:px-4">
      <div className="flex items-center gap-2">
        <span className="text-lg leading-none">🌍</span>
        <span className="font-display text-lg tracking-[0.2em] text-lime-400">FLAT WAR</span>
      </div>

      <div className="hidden items-center gap-1.5 md:flex">
        <Badge variant="outline" className="border-lime-400/30 font-mono text-[10px] text-lime-300">
          ROBINHOOD CHAIN · 4663
        </Badge>
        <Badge variant="outline" className="border-red-400/40 font-mono text-[10px] text-red-300">
          🔥 {gameState.wifBurned.toFixed(1)} $WIF BURNED
        </Badge>
        <Badge variant="outline" className="font-mono text-[10px] text-zinc-400">
          TICK {gameState.tick}
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        {player ? (
          <>
            <Res icon="⛏" label="IRON" value={player.iron} />
            <Res icon="🛢" label="OIL" value={player.oil} />
            <Res icon="💥" label="AMMO" value={player.ammo} />
            <Res icon="🪖" label="TROOPS" value={totalTroops} />
            <Res icon="🏙" label="CITIES" value={mine.length} />
            {shockActive && (
              <Badge className="animate-pulse bg-red-500/20 font-mono text-[10px] text-red-300">⚡ SHOCK x2</Badge>
            )}
            {player.isGuest && (
              <Button
                size="sm"
                variant="outline"
                disabled={!hasWallet() || linking}
                onClick={linkWallet}
                className="h-7 border-lime-400/40 px-2 font-mono text-[10px] text-lime-300 hover:bg-lime-400/10"
              >
                {linking ? '…' : '🔗 LINK WALLET'}
              </Button>
            )}
          </>
        ) : (
          <span className="font-mono text-[10px] text-zinc-500">awaiting commander…</span>
        )}
        <span
          className={`inline-block h-2 w-2 shrink-0 rounded-full ${connected ? 'bg-lime-400' : 'bg-red-500 animate-pulse'}`}
          title={connected ? 'live' : 'reconnecting…'}
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => setUi({ showLeaderboard: true })}
          className="hidden h-7 border-zinc-600 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800 sm:inline-flex"
        >
          🏆 RANKS
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setUi({ showHelp: true })}
          className="h-7 border-zinc-600 px-2 font-mono text-[10px] text-zinc-300 hover:bg-zinc-800"
        >
          ?
        </Button>
      </div>
    </header>
  )
}

function Res({ icon, label, value }: { icon: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap" title={label}>
      <span className="text-sm leading-none">{icon}</span>
      <span className="font-bold tabular-nums text-zinc-100">{Math.floor(value).toLocaleString()}</span>
      <span className="hidden text-[9px] text-zinc-500 lg:inline">{label}</span>
    </div>
  )
}

export function PlayerDot({ id }: { id: string | null }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorForPlayer(id) }} />
}
