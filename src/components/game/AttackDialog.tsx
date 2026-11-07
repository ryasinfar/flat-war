'use client'

// ─── Attack dialog — pick force, see odds, launch ───────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useEscape } from './useEscape'
import { useGame, colorForPlayer } from '@/lib/game/store'
import { apiAttack } from '@/lib/game/api'
import { attackDistanceKm, travelSeconds } from '@/lib/game/geo'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

export default function AttackDialog() {
  const cities = useGame((s) => s.cities)
  const player = useGame((s) => s.player)
  const token = useGame((s) => s.token)
  const playerNames = useGame((s) => s.playerNames)
  const setUi = useGame((s) => s.setUi)
  const applySnapshot = useGame((s) => s.applySnapshot)

  const [attack, setAttack] = useState<{ from: string; to: string } | null>(null)
  const [troops, setTroops] = useState(0)
  const [busy, setBusy] = useState(false)

  useEscape(!!attack, () => setAttack(null))

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ from: string; to: string }>).detail
      setAttack(d)
    }
    window.addEventListener('fw-attack', handler)
    return () => window.removeEventListener('fw-attack', handler)
  }, [])

  const from = cities.find((c) => c.id === attack?.from)
  const to = cities.find((c) => c.id === attack?.to)

  const info = useMemo(() => {
    if (!from || !to) return null
    const km = Math.min(
      attackDistanceKm(from, to),
      attackDistanceKm(from, { lat: to.lat, lon: to.lon > 0 ? to.lon - 360 : to.lon + 360 })
    )
    const maxTroops = Math.floor(from.troops)
    const ammo = Math.ceil(0.4 * troops)
    const shock = !!(player?.shockUntil && new Date(player.shockUntil).getTime() > Date.now())
    const atk = troops * (shock ? 2 : 1)
    const def = to.troops * (1 + 0.22 * to.b.bunker) * (to.isCapital ? 1.5 : 1)
    const odds = Math.min(95, Math.max(5, Math.round((atk / (atk + def)) * 100)))
    return { km, travel: travelSeconds(km), ammo, maxTroops, odds, shock, def }
  }, [from, to, troops, player])

  useEffect(() => {
    if (info && troops === 0) setTroops(Math.max(10, Math.min(info.maxTroops, Math.round(info.maxTroops * 0.8))))
  }, [info, troops])

  if (!attack || !from || !to || !info) return null

  async function launch() {
    if (!token || !attack) return
    setBusy(true)
    try {
      const r = await apiAttack(token, attack.from, attack.to, troops)
      if (r.snapshot) applySnapshot(r.snapshot, { keepSelection: true })
      setUi({ attackFrom: null })
      setAttack(null)
      setTroops(0)
      toast.success(`✈ strike inbound — arrives in ${r.travelSec}s`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'launch failed')
    } finally {
      setBusy(false)
    }
  }

  const defColor = colorForPlayer(to.ownerId)

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 p-3 backdrop-blur-sm" onClick={() => setAttack(null)}>
      <div
        className="w-full max-w-sm rounded-lg border border-red-400/30 bg-[#0c0e0a] p-4 font-mono shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="launch strike"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base tracking-widest text-red-400">⚔ LAUNCH STRIKE</h3>
          <button className="text-zinc-500 hover:text-zinc-200" onClick={() => setAttack(null)}>✕</button>
        </div>

        <div className="mb-3 grid grid-cols-[1fr,auto,1fr] items-center gap-2 text-center">
          <div className="rounded-md border border-zinc-800 bg-black/40 p-2">
            <div className="truncate text-xs font-bold text-zinc-100">{from.name.toUpperCase()}</div>
            <div className="text-[10px] text-zinc-500">{Math.floor(from.troops)} available</div>
          </div>
          <div className="text-center text-[10px] text-zinc-500">
            <div className="text-sm">→</div>
            <div className="tabular-nums">{Math.round(info.km).toLocaleString()}km</div>
            <div className="tabular-nums">{info.travel}s</div>
          </div>
          <div className="rounded-md border border-zinc-800 bg-black/40 p-2">
            <div className="truncate text-xs font-bold" style={{ color: defColor }}>{to.name.toUpperCase()}</div>
            <div className="text-[10px] text-zinc-500">
              {to.ownerId ? playerNames[to.ownerId] ?? '?' : 'militia'} · {Math.round(to.troops)}
            </div>
          </div>
        </div>

        <label className="mb-1 block text-[10px] uppercase tracking-widest text-zinc-500">
          strike force: <span className="text-zinc-200">{troops} troops</span> · ammo −{info.ammo}
        </label>
        <input
          type="range"
          min={10}
          max={Math.max(10, info.maxTroops)}
          value={troops}
          onChange={(e) => setTroops(Number(e.target.value))}
          className="w-full accent-red-500"
          aria-label="troops to send"
        />

        <div className="mt-3 space-y-1.5 rounded-md border border-zinc-800 bg-black/40 p-2.5 text-[11px]">
          <div className="flex justify-between"><span className="text-zinc-500">enemy defense (est.)</span><span className="tabular-nums text-zinc-200">{Math.round(info.def).toLocaleString()}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">your attack power {info.shock && <span className="text-red-400">⚡x2</span>}</span><span className="tabular-nums text-zinc-200">{Math.round(troops * (info.shock ? 2 : 1)).toLocaleString()}</span></div>
          <div className="pt-1">
            <div className="mb-1 flex justify-between text-[10px]"><span>win odds</span><span className="tabular-nums">{info.odds}%</span></div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
              <div className={`h-full ${info.odds > 60 ? 'bg-lime-400' : info.odds > 35 ? 'bg-amber-400' : 'bg-red-500'}`} style={{ width: `${info.odds}%` }} />
            </div>
          </div>
          {to.isCapital && <div className="text-amber-300">★ capital ×1.5 defense</div>}
        </div>

        <Button
          disabled={busy || troops < 10 || player!.ammo < info.ammo}
          onClick={launch}
          className="mt-3 h-10 w-full bg-red-500 font-mono text-sm font-bold text-white hover:bg-red-400"
        >
          {busy ? 'LAUNCHING…' : `SEND ${troops} TROOPS`}
        </Button>
        {player!.ammo < info.ammo && (
          <div className="mt-1.5 text-center text-[10px] text-red-400">
            not enough ammo ({info.ammo} needed) — build factories or train less
          </div>
        )}
      </div>
    </div>
  )
}
