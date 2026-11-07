'use client'

import { useGame, colorForPlayer } from '@/lib/game/store'
import { Button } from '@/components/ui/button'
import { useEffect, useState } from 'react'
import { useEscape } from './useEscape'

export function LeaderboardDialog() {
  const show = useGame((s) => s.ui.showLeaderboard)
  const setUi = useGame((s) => s.setUi)
  const rows = useGame((s) => s.leaderboard)
  const playerNames = useGame((s) => s.playerNames)
  const cities = useGame((s) => s.cities)
  const me = useGame((s) => s.player)
  useEscape(show, () => setUi({ showLeaderboard: false }))

  if (!show) return null
  const totalCaptured = cities.filter((c) => c.ownerId).length

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={() => setUi({ showLeaderboard: false })}>
      <div className="w-full max-w-md rounded-lg border border-lime-400/25 bg-[#0c0e0a] p-4 font-mono shadow-2xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="leaderboard">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base tracking-widest text-lime-400">🏆 SEASON 1 RANKS</h3>
          <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setUi({ showLeaderboard: false })}>✕</button>
        </div>
        <div className="mb-2 text-[10px] text-zinc-500">
          {totalCaptured} / {cities.length} cities conquered worldwide
        </div>
        <div className="max-h-[50vh] space-y-1 overflow-y-auto pr-1">
          {rows.length === 0 && (
            <div className="py-6 text-center text-xs text-zinc-500">no conquests yet — be the first</div>
          )}
          {rows.map((r, i) => (
            <div
              key={r.id}
              className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                r.id === me?.id ? 'border-lime-400/50 bg-lime-400/10' : 'border-zinc-800 bg-black/40'
              }`}
            >
              <span className="w-6 text-center font-bold text-zinc-500">{i + 1}</span>
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorForPlayer(r.id) }} />
              <span className="min-w-0 flex-1 truncate text-zinc-200">{playerNames[r.id] ?? r.name}</span>
              <span className="tabular-nums text-zinc-400" title="cities">🏙 {r.cities}</span>
              <span className="tabular-nums text-zinc-400" title="troops">🪖 {r.troops.toLocaleString()}</span>
              <span className="tabular-nums text-red-300" title="$WIF burned">🔥{r.wifSpent.toFixed(0)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export function HelpDialog() {
  const show = useGame((s) => s.ui.showHelp)
  const setUi = useGame((s) => s.setUi)
  useEscape(show, () => setUi({ showHelp: false }))

  if (!show) return null
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm"
      onClick={() => setUi({ showHelp: false })}>
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg border border-lime-400/25 bg-[#0c0e0a] p-4 font-mono shadow-2xl"
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label="how to play">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base tracking-widest text-lime-400">HOW TO PLAY</h3>
          <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setUi({ showHelp: false })}>✕</button>
        </div>
        <ol className="list-decimal space-y-2.5 pl-4 text-xs leading-relaxed text-zinc-300">
          <li><b className="text-lime-300">Claim a capital</b> — pick any free city at least 600 km from enemy capitals.</li>
          <li><b className="text-lime-300">Build industry</b> — mines make iron, derricks make oil, factories turn them into ammo (every 10 s tick).</li>
          <li><b className="text-lime-300">Train troops</b> — barracks speed training; troops defend and attack.</li>
          <li><b className="text-lime-300">Strike neighbours</b> — select your city → LAUNCH STRIKE → pick a target within 1400 km. Battles resolve in flight.</li>
          <li><b className="text-lime-300">Take the world</b> — captured cities keep (damaged) industry. Defenders get bunker and capital bonuses. Defeats retreat 30 % of your force.</li>
          <li><b className="text-red-300">Burn $WIF</b> — optional onchain boosts: ⚡ instant finish (3), 🪂 airlift +400 troops (5), 🔥 shock &amp; awe ×2 next strike (2). Every $WIF is burned to 0x…dEaD on Robinhood Chain and verified before it applies.</li>
        </ol>
        <div className="mt-3 rounded-md border border-zinc-800 bg-black/40 p-2.5 text-[10px] leading-relaxed text-zinc-500">
          playing is 100 % free — $WIF never gates victory, it only accelerates and burns.
          built for the world is flat hackathon on Robinhood Chain (chain 4663).
        </div>
      </div>
    </div>
  )
}

export function ClaimBanner() {
  const player = useGame((s) => s.player)
  const cities = useGame((s) => s.cities)
  const claimMode = useGame((s) => s.ui.claimMode)
  const setUi = useGame((s) => s.setUi)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 1000)
    return () => clearInterval(t)
  }, [])
  void tick
  if (!player || claimMode) return null
  const mine = cities.filter((c) => c.ownerId === player.id).length
  if (mine > 0) return null
  return (
    <div className="absolute inset-x-0 top-2 z-20 flex justify-center px-3">
      <button
        onClick={() => setUi({ claimMode: true })}
        className="animate-pulse rounded-md border border-lime-400/50 bg-lime-400/15 px-4 py-2 font-mono text-xs font-bold text-lime-300 shadow-lg backdrop-blur hover:bg-lime-400/25"
      >
        🏴 YOU HAVE NO TERRITORY — CLICK TO PICK A CAPITAL
      </button>
    </div>
  )
}
