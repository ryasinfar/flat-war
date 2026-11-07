'use client'

// ─── Battle report toast — auto-dismisses, never blocks the map ─────────────
import { useEffect } from 'react'
import { useGame } from '@/lib/game/store'

export default function BattleReport() {
  const ui = useGame((s) => s.ui)
  const setUi = useGame((s) => s.setUi)
  const player = useGame((s) => s.player)

  const log = ui.reportLog
  const key = ui.reportKey

  // auto-dismiss after 9 s
  useEffect(() => {
    if (!key) return
    const t = setTimeout(() => setUi({ reportDismissed: key }), 9000)
    return () => clearTimeout(t)
  }, [key, setUi])

  if (!log || !log.result || !key) return null
  if (ui.reportDismissed === key) return null

  const involved = player && (log.attacker === player.name || log.defender === player.name)
  if (!involved) return null

  const won = log.result === 'captured' && log.defender !== player?.name

  return (
    <div className="pointer-events-none absolute left-1/2 top-16 z-30 w-[92%] max-w-sm -translate-x-1/2 rounded-lg border shadow-2xl backdrop-blur"
      style={{
        borderColor: won ? 'rgba(163,230,53,0.5)' : 'rgba(248,113,113,0.5)',
        background: 'rgba(12,14,10,0.97)',
      }}
      role="alert"
    >
      <div className="p-3 font-mono">
        <div className="mb-1.5 flex items-center justify-between">
          <h4 className={`font-display text-sm tracking-widest ${won ? 'text-lime-400' : 'text-red-400'}`}>
            {won ? '⚔ VICTORY' : '🛡 DEFEAT'}
          </h4>
          <button
            className="pointer-events-auto px-1 text-zinc-500 hover:text-zinc-200"
            onClick={() => setUi({ reportDismissed: key })}
            aria-label="dismiss report"
          >✕</button>
        </div>
        <div className="space-y-0.5 text-[11px] text-zinc-300">
          <div>{log.city}</div>
          <div className="text-zinc-500">
            {log.attacker} ({log.troopsSent.toLocaleString()} troops{log.shock ? ' ⚡x2' : ''})
            {' '}vs {log.defender} ({log.defenders.toLocaleString()}{log.capitalBonus ? ' ★' : ''})
          </div>
          <div className="pt-1 text-zinc-400">
            attacker losses <b className="text-red-400">{log.atkLosses.toLocaleString()}</b> ·
            defender losses <b className="text-lime-300">{log.defLosses.toLocaleString()}</b>
          </div>
          <div className="pt-0.5 text-[10px] text-zinc-500">
            power {log.atkPower.toLocaleString()} vs {log.defPower.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  )
}
