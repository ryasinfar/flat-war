'use client'

// ─── City panel: intel, construction, training, strikes ─────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useGame, colorForPlayer } from '@/lib/game/store'
import { apiBuild, apiTrain, apiClaim } from '@/lib/game/api'
import { attackDistanceKm, travelSeconds } from '@/lib/game/geo'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

const BUILD_META: Record<string, { label: string; icon: string; effect: string; color: string }> = {
  mine: { label: 'Iron Mine', icon: '⛏', effect: '+3 iron/tick per level', color: 'text-amber-300' },
  derrick: { label: 'Oil Derrick', icon: '🛢', effect: '+2 oil/tick per level', color: 'text-zinc-200' },
  factory: { label: 'Ammunition Factory', icon: '🏭', effect: '+1 ammo/tick per level (uses iron+oil)', color: 'text-lime-300' },
  barracks: { label: 'Barracks', icon: '🏕', effect: '-15% training time per level', color: 'text-orange-300' },
  bunker: { label: 'Bunker', icon: '🛡', effect: '+22% defense per level', color: 'text-teal-300' },
}

const BUILD_ORDER = ['mine', 'derrick', 'factory', 'barracks', 'bunker'] as const

export default function CityPanel() {
  const cities = useGame((s) => s.cities)
  const player = useGame((s) => s.player)
  const token = useGame((s) => s.token)
  const playerNames = useGame((s) => s.playerNames)
  const selectedCityId = useGame((s) => s.ui.selectedCityId)
  const attackFrom = useGame((s) => s.ui.attackFrom)
  const claimMode = useGame((s) => s.ui.claimMode)
  const setUi = useGame((s) => s.setUi)

  const city = cities.find((c) => c.id === selectedCityId)

  // distances from my nearest city (cheap — recomputed per render)
  const nearest = useMemo(() => {
    if (!player || !city) return null
    let best: { city: typeof cities[number]; km: number } | null = null
    for (const c of cities) {
      if (c.ownerId !== player.id) continue
      const km = Math.min(
        attackDistanceKm(c, city),
        attackDistanceKm(c, { lat: city.lat, lon: city.lon > 0 ? city.lon - 360 : city.lon + 360 })
      )
      if (!best || km < best.km) best = { city: c, km }
    }
    return best
  }, [cities, city, player])

  if (!city) return null

  const isMine = !!player && city.ownerId === player.id
  const ownerName = city.ownerId ? playerNames[city.ownerId] ?? 'unknown' : 'Neutral Militia'
  const ownerColor = colorForPlayer(city.ownerId)

  function close() { setUi({ selectedCityId: null }) }

  function flyHere() {
    window.dispatchEvent(new CustomEvent('fw-fly', { detail: { lat: city.lat, lon: city.lon } }))
  }

  return (
    <div className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 max-h-[46vh] overflow-y-auto rounded-lg border border-lime-400/25 bg-[#0c0e0a]/95 shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-14 sm:max-h-[calc(100vh-8.5rem)] sm:w-80" role="complementary" aria-label="city details">
      <div className="sticky top-0 z-10 flex items-start gap-2 border-b border-zinc-800 bg-[#0c0e0a] px-3 py-2.5">
        <button className="mt-0.5 text-lime-400" onClick={flyHere} title="center map here">🎯</button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: ownerColor }} />
            <h2 className="truncate font-display text-base tracking-wider text-zinc-100">
              {city.name.toUpperCase()}
            </h2>
            {city.isCapital && <Badge className="bg-lime-400/15 font-mono text-[9px] text-lime-300">★ CAPITAL</Badge>}
          </div>
          <div className="mt-0.5 text-[11px] text-zinc-500">
            {city.country} · tier {city.tier} · owned by <span style={{ color: ownerColor }}>{ownerName}</span>
          </div>
        </div>
        <button className="px-1 text-zinc-500 hover:text-zinc-200" onClick={close} aria-label="close">✕</button>
      </div>

      <div className="space-y-3 p-3 font-mono text-xs">
        {/* garrison */}
        <div className="flex items-center justify-between rounded-md border border-zinc-800 bg-black/40 px-3 py-2">
          <span className="text-zinc-400">🪖 GARRISON</span>
          <span className="text-sm font-bold tabular-nums text-zinc-100">
            {Math.round(city.troops).toLocaleString()}
          </span>
        </div>
        {isMine && city.b.bunker > 0 && (
          <div className="text-[10px] text-teal-300">🛡 bunker lv{city.b.bunker} · capital defense ×1.5 if ★</div>
        )}

        {/* claim mode */}
        {claimMode && !city.ownerId && player && (
          <ClaimBox cityId={city.id} name={city.name} />
        )}

        {isMine && (
          <>
            {/* buildings */}
            <div className="space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500">Industry</div>
              {BUILD_ORDER.map((kind) => (
                <BuildingRow key={kind} kind={kind} level={city.b[kind]} cityId={city.id}
                  busy={!!city.buildTask} task={city.buildTask} />
              ))}
            </div>

            {/* construction in progress */}
            {city.buildTask && (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-2.5">
                <div className="flex items-center justify-between text-[11px] text-amber-200">
                  <span>🏗 building {BUILD_META[city.buildTask.kind]?.label} → lv{city.buildTask.targetLevel}</span>
                  <Countdown to={city.buildTask.readyAt} />
                </div>
                <Button
                  size="sm"
                  onClick={() => setUi({ wifAction: { kind: 'speedup', cityId: city.id } })}
                  className="mt-2 h-7 w-full bg-lime-400 font-mono text-[10px] font-bold text-black hover:bg-lime-300"
                >
                  ⚡ FINISH NOW — BURN 3 $WIF
                </Button>
              </div>
            )}

            {/* training */}
            <TrainBox city={city} />

            {/* strike */}
            {attackFrom === city.id ? (
              <div className="rounded-md border border-red-400/40 bg-red-500/10 p-2 text-center text-[11px] text-red-300">
                🎯 attack mode active — pick a target on the map
                <Button size="sm" variant="outline" className="ml-2 h-6 border-zinc-600 px-2 text-[10px]"
                  onClick={() => setUi({ attackFrom: null })}>cancel</Button>
              </div>
            ) : (
              <Button
                size="sm"
                disabled={city.troops < 10}
                onClick={() => { setUi({ attackFrom: city.id, selectedCityId: city.id }); toast('pick a target on the map') }}
                className="h-9 w-full bg-red-500/90 font-mono text-xs font-bold text-white hover:bg-red-500"
              >
                ⚔ LAUNCH STRIKE FROM HERE
              </Button>
            )}

            {/* airlift */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUi({ wifAction: { kind: 'airlift', cityId: city.id } })}
              className="h-8 w-full border-lime-400/40 font-mono text-[10px] text-lime-300 hover:bg-lime-400/10"
            >
              🪂 AIRLIFT +400 TROOPS — BURN 5 $WIF
            </Button>
          </>
        )}

        {/* enemy intel */}
        {!isMine && player && (
          <div className="space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Intel</div>
            <div className="rounded-md border border-zinc-800 bg-black/40 p-2.5 text-[11px] text-zinc-300">
              {city.ownerId ? (
                <div>defended by <span style={{ color: ownerColor }}>{ownerName}</span></div>
              ) : (
                <div className="text-zinc-400">held by local militia — free to take</div>
              )}
              {city.b.bunker > 0 && <div className="mt-1 text-teal-300">🛡 bunker lv{city.b.bunker}</div>}
              {city.isCapital && <div className="mt-1 text-amber-300">★ capital gets ×1.5 defense</div>}
            </div>
            {nearest && (
              <div className="text-[10px] text-zinc-500">
                nearest of yours: {nearest.city.name} — {Math.round(nearest.km).toLocaleString()} km
                {nearest.km <= 1400 ? ' (in range)' : ' (out of range)'} · flight {travelSeconds(nearest.km)}s
              </div>
            )}
            <Button
              size="sm"
              onClick={() => { setUi({ attackFrom: nearest?.city.id ?? null, selectedCityId: city.id }); }}
              disabled={!nearest || nearest.km > 1400}
              className="h-9 w-full bg-red-500/90 font-mono text-xs font-bold text-white hover:bg-red-500"
            >
              ⚔ STRIKE FROM {nearest?.city.name.toUpperCase() ?? '—'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function BuildingRow({ kind, level, cityId, busy, task }: {
  kind: string; level: number; cityId: string; busy: boolean
  task: { kind: string; targetLevel: number; readyAt: number } | null
}) {
  const token = useGame((s) => s.token)
  const applySnapshot = useGame((s) => s.applySnapshot)
  const [busyLocal, setBusyLocal] = useState(false)
  const meta = BUILD_META[kind]
  const buildingThis = task?.kind === kind

  async function build() {
    if (!token) return
    setBusyLocal(true)
    try {
      const snap = await apiBuild(token, cityId, kind)
      applySnapshot(snap, { keepSelection: true })
      toast.success(`construction started: ${meta.label} → lv${(level ?? 0) + 1}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'build failed')
    } finally {
      setBusyLocal(false)
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-md border border-zinc-800 bg-black/40 px-2.5 py-1.5">
      <span className="text-base leading-none">{meta.icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className={`truncate text-[11px] ${meta.color}`}>{meta.label}</span>
          <span className="text-[11px] font-bold tabular-nums text-zinc-300">lv{level}</span>
        </div>
        <div className="mt-1 flex gap-0.5">
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i < level ? 'bg-lime-400' : 'bg-zinc-800'}`} />
          ))}
        </div>
      </div>
      {buildingThis ? (
        <Badge variant="outline" className="animate-pulse border-amber-400/40 font-mono text-[9px] text-amber-300">
          <Countdown to={task.targetLevel ? task.readyAt : 0} /> → lv{task.targetLevel}
        </Badge>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={busy || busyLocal || level >= 5}
          onClick={build}
          className="h-6 border-zinc-700 px-2 font-mono text-[9px] text-zinc-300 hover:bg-zinc-800"
        >
          {level >= 5 ? 'MAX' : 'BUILD'}
        </Button>
      )}
    </div>
  )
}

function TrainBox({ city }: { city: ReturnType<typeof useGame.getState>['cities'][number] }) {
  const token = useGame((s) => s.token)
  const player = useGame((s) => s.player)
  const applySnapshot = useGame((s) => s.applySnapshot)
  const [amount, setAmount] = useState(100)
  const [busy, setBusy] = useState(false)

  const unit = { iron: 1.5, ammo: 1, oil: 0.5 } // per troop
  const cost = {
    iron: Math.ceil(unit.iron * amount),
    ammo: Math.ceil(unit.ammo * amount),
    oil: Math.ceil(unit.oil * amount),
  }
  const affordable = player && player.iron >= cost.iron && player.ammo >= cost.ammo && player.oil >= cost.oil

  async function train() {
    if (!token) return
    setBusy(true)
    try {
      const snap = await apiTrain(token, city.id, amount)
      applySnapshot(snap, { keepSelection: true })
      toast.success(`training ${amount} troops`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'training failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-widest text-zinc-500">Train troops</div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={10}
          max={1000}
          step={10}
          value={amount}
          onChange={(e) => setAmount(Math.max(10, Math.min(1000, Number(e.target.value) || 10)))}
          className="h-8 w-20 border-zinc-700 bg-black/60 font-mono text-xs"
        />
        <div className="flex-1 text-[10px] text-zinc-400">
          cost {cost.iron}⛏ {cost.oil}🛢 {cost.ammo}💥 · ~{Math.max(10, Math.round(90 * (1 - 0.15 * city.b.barracks) * (amount / 100)))}s
        </div>
        <Button size="sm" disabled={!affordable || !!city.trainTask || busy} onClick={train}
          className="h-8 bg-orange-400/90 px-3 font-mono text-[10px] font-bold text-black hover:bg-orange-300">
          TRAIN
        </Button>
      </div>
      {city.trainTask && (
        <div className="flex items-center justify-between rounded-md border border-orange-400/30 bg-orange-400/5 px-2.5 py-2 text-[11px] text-orange-200">
          <span>🪖 training {city.trainTask.amount} troops…</span>
          <Countdown to={city.trainTask.readyAt} />
        </div>
      )}
      {city.trainTask && (
        <Button
          size="sm"
          onClick={() => useGame.getState().setUi({ wifAction: { kind: 'speedup', cityId: city.id } })}
          className="h-7 w-full bg-lime-400 font-mono text-[10px] font-bold text-black hover:bg-lime-300"
        >
          ⚡ FINISH NOW — BURN 3 $WIF
        </Button>
      )}
    </div>
  )
}

function ClaimBox({ cityId, name }: { cityId: string; name: string }) {
  const token = useGame((s) => s.token)
  const applySnapshot = useGame((s) => s.applySnapshot)
  const [busy, setBusy] = useState(false)

  async function claim() {
    if (!token) return
    setBusy(true)
    try {
      const snap = await apiClaim(token, cityId)
      applySnapshot(snap)
      useGame.getState().setUi({ claimMode: false })
      toast.success(`🏴 capital established in ${name}!`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'claim failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-md border border-lime-400/40 bg-lime-400/10 p-2.5">
      <div className="text-[11px] text-lime-200">Establish your capital here?</div>
      <Button disabled={busy} onClick={claim}
        className="mt-2 h-8 w-full bg-lime-400 font-mono text-xs font-bold text-black hover:bg-lime-300">
        🏴 CLAIM {name.toUpperCase()} AS CAPITAL
      </Button>
    </div>
  )
}

function Countdown({ to }: { to: number }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [])
  const left = Math.max(0, to - now)
  const m = Math.floor(left / 60000)
  const s = Math.ceil((left % 60000) / 1000)
  return <span className="tabular-nums">{m > 0 ? `${m}m ${s}s` : `${s}s`}</span>
}
