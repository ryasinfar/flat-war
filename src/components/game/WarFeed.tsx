'use client'

// ─── Live war feed (right panel) + battle report toast ──────────────────────
import { useEffect, useRef } from 'react'
import { useGame } from '@/lib/game/store'
import { Button } from '@/components/ui/button'

const KIND_STYLE: Record<string, { color: string }> = {
  capture: { color: 'text-red-300' },
  battle: { color: 'text-amber-300' },
  join: { color: 'text-lime-300' },
  burn: { color: 'text-red-400' },
  build: { color: 'text-zinc-300' },
  system: { color: 'text-zinc-400' },
  season: { color: 'text-lime-200' },
}

export default function WarFeed() {
  const events = useGame((s) => s.events)
  const showFeed = useGame((s) => s.ui.showFeed)
  const setUi = useGame((s) => s.setUi)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 })
  }, [events])

  if (!showFeed) {
    return (
      <Button
        size="sm"
        variant="outline"
        onClick={() => setUi({ showFeed: true })}
        className="absolute right-2 top-14 z-20 h-8 border-zinc-700 bg-black/70 px-2 font-mono text-[10px] text-zinc-300 backdrop-blur"
      >
        📡 FEED ({events.length})
      </Button>
    )
  }

  return (
    <div className="absolute right-2 top-14 z-20 w-64 rounded-lg border border-zinc-800 bg-[#0c0e0a]/95 shadow-xl backdrop-blur sm:w-72">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-1.5">
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">📡 war feed</span>
        <button className="px-1 text-zinc-500 hover:text-zinc-200" onClick={() => setUi({ showFeed: false })}>✕</button>
      </div>
      <div ref={scrollRef} className="max-h-[38vh] space-y-1 overflow-y-auto p-2 sm:max-h-[42vh]">
        {events.length === 0 && <div className="p-3 text-center text-[11px] text-zinc-600">quiet before the storm…</div>}
        {events.map((e) => (
          <div key={e.id} className="rounded border border-zinc-900 bg-black/40 px-2 py-1.5 font-mono text-[10.5px] leading-snug">
            <span className={KIND_STYLE[e.kind]?.color ?? 'text-zinc-300'}>{e.text}</span>
            <span className="ml-1 text-zinc-600">
              {new Date(e.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
