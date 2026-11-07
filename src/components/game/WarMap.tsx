'use client'

// ─── Flat War — interactive world war map (Canvas 2D) ───────────────────────
import { useEffect, useRef, useState, useCallback } from 'react'
import { useGame, colorForPlayer } from '@/lib/game/store'
import type { City } from '@/lib/game/types'
import { haversineKm } from '@/lib/game/geo'

const WORLD_W = 2400
const WORLD_H = 1200
const MAX_RANGE_KM = 1400

interface GeoFeature { geometry: { type: string; coordinates: unknown } }
let landPath: Path2D | null = null
let landPromise: Promise<void> | null = null

function proj(lat: number, lon: number): [number, number] {
  return [((lon + 180) / 360) * WORLD_W, ((90 - lat) / 180) * WORLD_H]
}

function buildLand(features: GeoFeature[]) {
  const path = new Path2D()
  const addPoly = (poly: number[][][]) => {
    for (const ring of poly) {
      ring.forEach(([lon, lat], i) => {
        const [x, y] = proj(lat, lon)
        if (i === 0) path.moveTo(x, y)
        else path.lineTo(x, y)
      })
      path.closePath()
    }
  }
  for (const f of features) {
    const g = f.geometry
    if (g.type === 'Polygon') addPoly(g.coordinates as number[][][])
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates as number[][][][]) addPoly(p)
  }
  return path
}

function ensureLand(): Promise<void> {
  if (landPath) return Promise.resolve()
  if (!landPromise) {
    landPromise = fetch('/world-countries.geo.json')
      .then((r) => r.json())
      .then((geo) => { landPath = buildLand(geo.features) })
      .catch(() => {})
  }
  return landPromise
}

export default function WarMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; city: City } | null>(null)

  // view state kept in a ref for the render loop
  const view = useRef({ x: 0, y: 0, scale: 1, ready: false })
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const dragState = useRef({ dragging: false, moved: false, lx: 0, ly: 0, pinchDist: 0, pinchScale: 1 })
  const hoverCity = useRef<City | null>(null)
  const nowRef = useRef(Date.now())

  const cities = useGame((s) => s.cities)
  const battles = useGame((s) => s.battles)
  const player = useGame((s) => s.player)
  const explosions = useGame((s) => s.explosions)
  const ui = useGame((s) => s.ui)
  const setUi = useGame((s) => s.setUi)
  const citiesRef = useRef<City[]>(cities)
  citiesRef.current = cities
  const battlesRef = useRef(battles)
  battlesRef.current = battles
  const explosionsRef = useRef(explosions)
  explosionsRef.current = explosions
  const playerRef = useRef(player)
  playerRef.current = player
  const uiRef = useRef(ui)
  uiRef.current = ui

  // ── initial view fit + land load ──
  useEffect(() => { void ensureLand() }, [])

  const fitView = useCallback(() => {
    const wrap = wrapRef.current
    if (!wrap) return
    const s = Math.max(wrap.clientWidth / WORLD_W, wrap.clientHeight / WORLD_H) * 1.02
    view.current = {
      x: wrap.clientWidth / 2 - (WORLD_W * s) / 2,
      y: wrap.clientHeight / 2 - (WORLD_H * s) / 2,
      scale: s,
      ready: true,
    }
  }, [])

  useEffect(() => {
    fitView()
    const onResize = () => { if (!view.current.ready) fitView() }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [fitView])

  // ── fly-to via custom event ──
  useEffect(() => {
    const handler = (e: Event) => {
      const { lat, lon } = (e as CustomEvent<{ lat: number; lon: number }>).detail
      const wrap = wrapRef.current
      if (!wrap) return
      const s = view.current.scale
      const [wx, wy] = proj(lat, lon)
      view.current.x = wrap.clientWidth / 2 - wx * s
      view.current.y = wrap.clientHeight / 2 - wy * s
    }
    window.addEventListener('fw-fly', handler)
    return () => window.removeEventListener('fw-fly', handler)
  }, [])

  const screenOf = useCallback((c: City) => {
    const [wx, wy] = proj(c.lat, c.lon)
    return [wx * view.current.scale + view.current.x, wy * view.current.scale + view.current.y] as [number, number]
  }, [])

  const pickCity = useCallback((sx: number, sy: number): City | null => {
    let best: City | null = null
    let bestD = 18 * 18
    for (const c of citiesRef.current) {
      const [x, y] = screenOf(c)
      const d = (x - sx) ** 2 + (y - sy) ** 2
      const r = (c.tier === 1 ? 16 : c.tier === 2 ? 13 : 11) ** 2
      if (d < Math.max(bestD, r) && d < r * 2.2) {
        if (d < bestD || (best && c.tier < best.tier)) { bestD = Math.min(d, bestD); best = c }
      }
    }
    return best
  }, [screenOf])

  // ── pointer handlers ──
  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      dragState.current.pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
      dragState.current.pinchScale = view.current.scale
    }
    dragState.current.dragging = true
    dragState.current.moved = false
    dragState.current.lx = e.clientX
    dragState.current.ly = e.clientY
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top

    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && dragState.current.dragging) {
      const [a, b] = [...pointers.current.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (dragState.current.pinchDist > 0) {
        const ns = Math.min(6, Math.max(0.35, dragState.current.pinchScale * (d / dragState.current.pinchDist)))
        view.current.scale = ns
      }
      return
    }

    if (dragState.current.dragging) {
      const dx = e.clientX - dragState.current.lx
      const dy = e.clientY - dragState.current.ly
      if (Math.abs(dx) + Math.abs(dy) > 4) dragState.current.moved = true
      view.current.x += dx
      view.current.y += dy
      dragState.current.lx = e.clientX
      dragState.current.ly = e.clientY
    }

    const c = pickCity(sx, sy)
    hoverCity.current = c
    setTooltip(c ? { x: sx, y: sy, city: c } : null)
    canvasRef.current!.style.cursor = c ? 'pointer' : dragState.current.dragging ? 'grabbing' : 'grab'
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const wasPinch = pointers.current.size === 2
    pointers.current.delete(e.pointerId)
    dragState.current.dragging = pointers.current.size > 0
    if (wasPinch) dragState.current.pinchDist = 0
    if (dragState.current.moved || wasPinch) return
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const sx = e.clientX - rect.left
    const sy = e.clientY - rect.top
    const c = pickCity(sx, sy)
    if (!c) { setUi({ selectedCityId: null, attackFrom: null }); return }

    const u = uiRef.current
    if (u.attackFrom) {
      if (c.id === u.attackFrom) { setUi({ attackFrom: null }); return }
      const target = citiesRef.current.find((x) => x.id === c.id)
      const origin = citiesRef.current.find((x) => x.id === u.attackFrom)
      if (!target || !origin) return
      if (target.ownerId === playerRef.current?.id) { setUi({ selectedCityId: c.id }); return }
      // open attack dialog
      setUi({ selectedCityId: c.id, wifAction: null })
      window.dispatchEvent(new CustomEvent('fw-attack', { detail: { from: u.attackFrom, to: c.id } }))
      return
    }
    setUi({ selectedCityId: c.id })
  }

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = canvasRef.current?.getBoundingClientRect()
    if (!rect) return
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
    const ns = Math.min(6, Math.max(0.35, view.current.scale * factor))
    view.current.x = mx - ((mx - view.current.x) * ns) / view.current.scale
    view.current.y = my - ((my - view.current.y) * ns) / view.current.scale
    view.current.scale = ns
  }

  // ── render loop ──
  useEffect(() => {
    let raf = 0
    const draw = () => {
      raf = requestAnimationFrame(draw)
      nowRef.current = Date.now()
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr
        canvas.height = h * dpr
        canvas.style.width = `${w}px`
        canvas.style.height = `${h}px`
      }
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const now = nowRef.current
      const v = view.current

      // bg
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, '#0b0d0a')
      g.addColorStop(1, '#070806')
      ctx.fillStyle = g
      ctx.fillRect(0, 0, w, h)

      if (!v.ready) return
      ctx.save()
      ctx.translate(v.x, v.y)
      ctx.scale(v.scale, v.scale)

      // graticule
      ctx.strokeStyle = 'rgba(163,230,53,0.05)'
      ctx.lineWidth = 1 / v.scale
      for (let lon = -180; lon <= 180; lon += 30) {
        const [x1, y1] = proj(90, lon)
        const [x2, y2] = proj(-90, lon)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const [x1, y1] = proj(lat, -180)
        const [x2, y2] = proj(lat, 180)
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke()
      }

      // land
      if (landPath) {
        ctx.fillStyle = '#151a13'
        ctx.strokeStyle = '#2a3325'
        ctx.lineWidth = 1 / v.scale
        ctx.fill(landPath)
        ctx.stroke(landPath)
      }

      // battles in flight
      for (const b of battlesRef.current) {
        const from = citiesRef.current.find((c) => c.id === b.fromCityId)
        const to = citiesRef.current.find((c) => c.id === b.toCityId)
        if (!from || !to) continue
        const [x1, y1] = proj(from.lat, from.lon)
        const [x2, y2] = proj(to.lat, to.lon)
        const t0 = b.createdAt ? new Date(b.createdAt).getTime() : now - 3000
        const t1 = new Date(b.arriveAt).getTime()
        const p = Math.min(1, Math.max(0, (now - t0) / Math.max(1, t1 - t0)))
        const mx = x1 + (x2 - x1) * p
        const my = y1 + (y2 - y1) * p
        const attackerColor = colorForPlayer(b.attackerId)

        ctx.setLineDash([6 / v.scale, 5 / v.scale])
        ctx.lineDashOffset = -(now / 40) / v.scale
        ctx.strokeStyle = attackerColor + 'aa'
        ctx.lineWidth = 2 / v.scale
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(mx, my)
        ctx.stroke()
        ctx.setLineDash([])

        // warhead
        ctx.fillStyle = attackerColor
        ctx.beginPath()
        ctx.arc(mx, my, 3.5 / Math.max(0.7, v.scale ** 0.4), 0, Math.PI * 2)
        ctx.fill()
      }

      // explosions
      for (const ex of explosionsRef.current) {
        const c = citiesRef.current.find((x) => x.id === ex.cityId)
        if (!c) continue
        const [x, y] = proj(c.lat, c.lon)
        const age = (now - ex.at) / 1600
        if (age > 1) continue
        const col = ex.result === 'captured' ? '#f87171' : '#a3e635'
        ctx.strokeStyle = col
        ctx.globalAlpha = 1 - age
        ctx.lineWidth = 3 / v.scale
        ctx.beginPath()
        ctx.arc(x, y, (10 + age * 46) / v.scale ** 0.5, 0, Math.PI * 2)
        ctx.stroke()
        ctx.globalAlpha = 1
      }

      // cities
      for (const c of citiesRef.current) {
        const [x, y] = proj(c.lat, c.lon)
        const col = colorForPlayer(c.ownerId)
        const r = (c.tier === 1 ? 6.5 : c.tier === 2 ? 5 : 3.8) / Math.max(0.7, v.scale ** 0.35)
        const isMine = playerRef.current && c.ownerId === playerRef.current.id
        const hovered = hoverCity.current?.id === c.id
        const selected = uiRef.current.selectedCityId === c.id

        // targetable highlight in attack mode
        const u = uiRef.current
        if (u.attackFrom) {
          const origin = citiesRef.current.find((o) => o.id === u.attackFrom)
          if (origin && c.id !== origin.id && c.ownerId !== playerRef.current?.id) {
            const d = Math.min(
              haversineKm(origin.lat, origin.lon, c.lat, c.lon),
              haversineKm(origin.lat, origin.lon, c.lat, c.lon > 0 ? c.lon - 360 : c.lon + 360)
            )
            if (d <= MAX_RANGE_KM) {
              const pulse = 0.5 + 0.5 * Math.sin(now / 220)
              ctx.strokeStyle = `rgba(163,230,53,${0.35 + 0.45 * pulse})`
              ctx.lineWidth = 2.2 / v.scale
              ctx.beginPath()
              ctx.arc(x, y, r + 5 / v.scale ** 0.4, 0, Math.PI * 2)
              ctx.stroke()
            }
          }
        }

        // claim mode pulse on free cities
        if (u.claimMode && !c.ownerId) {
          const pulse = 0.5 + 0.5 * Math.sin(now / 220)
          ctx.strokeStyle = `rgba(163,230,53,${0.4 + 0.5 * pulse})`
          ctx.lineWidth = 2.2 / v.scale
          ctx.beginPath()
          ctx.arc(x, y, r + 6 / v.scale ** 0.4, 0, Math.PI * 2)
          ctx.stroke()
        }

        // capital ring
        if (c.isCapital) {
          ctx.strokeStyle = col
          ctx.lineWidth = 1.6 / v.scale
          ctx.beginPath()
          ctx.arc(x, y, r + 3.2 / v.scale ** 0.4, 0, Math.PI * 2)
          ctx.stroke()
        }

        // selection ring
        if (selected || hovered) {
          ctx.strokeStyle = '#ffffffcc'
          ctx.lineWidth = 1.6 / v.scale
          ctx.beginPath()
          ctx.arc(x, y, r + (selected ? 7 : 4.5) / v.scale ** 0.4, 0, Math.PI * 2)
          ctx.stroke()
        }

        // dot
        ctx.fillStyle = c.ownerId ? col : '#5c6459'
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fill()
        if (c.ownerId) {
          ctx.strokeStyle = '#00000088'
          ctx.lineWidth = 1 / v.scale
          ctx.stroke()
        }
      }

      ctx.restore()

      // labels (screen space)
      ctx.font = '600 11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      for (const c of citiesRef.current) {
        const showLabel = c.tier === 1 || c.isCapital || c.ownerId || hoverCity.current?.id === c.id || v.scale > 1.6
        if (!showLabel) continue
        const [x, y] = proj(c.lat, c.lon)
        const sx = x * v.scale + v.x
        const sy = y * v.scale + v.y
        if (sx < -50 || sx > w + 50 || sy < -20 || sy > h + 20) continue
        const col = colorForPlayer(c.ownerId)
        const label = c.name.toUpperCase()
        const ty = sy - (c.tier === 1 ? 13 : 11) / Math.max(0.7, v.scale ** 0.3) - 4
        ctx.fillStyle = 'rgba(0,0,0,0.55)'
        const tw = ctx.measureText(label).width
        ctx.fillRect(sx - tw / 2 - 3, ty - 10, tw + 6, 13)
        ctx.fillStyle = c.ownerId ? col : '#9aa396'
        ctx.fillText(label, sx, ty)
      }
    }
    raf = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden touch-none select-none">
      <canvas
        ref={canvasRef}
        className="block h-full w-full"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => { setTooltip(null); hoverCity.current = null }}
        onWheel={onWheel}
      />
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-52 rounded-md border border-lime-400/30 bg-black/85 px-2.5 py-1.5 font-mono text-[11px] leading-tight text-zinc-200 shadow-xl"
          style={{ left: Math.min(tooltip.x + 14, (wrapRef.current?.clientWidth ?? 300) - 210), top: Math.max(8, tooltip.y - 40) }}
        >
          <div className="font-bold tracking-wider text-lime-300">{tooltip.city.name.toUpperCase()}</div>
          <div className="text-zinc-400">{tooltip.city.country}</div>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: colorForPlayer(tooltip.city.ownerId) }} />
            <span>{tooltip.city.ownerId ? (useGame.getState().playerNames[tooltip.city.ownerId] ?? 'unknown') : 'neutral militia'}</span>
          </div>
          <div className="text-zinc-400">
            {Math.round(tooltip.city.troops)} troops · {tooltip.city.isCapital ? '★ capital' : `tier ${tooltip.city.tier}`}
          </div>
        </div>
      )}
    </div>
  )
}
