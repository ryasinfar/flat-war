'use client'

// ─── Flat War global state (zustand) + HTTP polling transport ────────────────
import { create } from 'zustand'
import { apiState } from './api'
import type { BattleLog, Snapshot, ReportInfo } from './types'

export const PLAYER_COLORS = [
  '#a3e635', // lime
  '#f59e0b', // amber
  '#fb7185', // rose
  '#f97316', // orange
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
  '#facc15', // yellow
  '#4ade80', // green
  '#f43f5e', // red-pink
  '#c084fc', // purple
  '#34d399', // emerald
  '#fb923c', // orange light
]

export function colorForPlayer(id: string | null | undefined): string {
  if (!id) return '#6b7280' // neutral gray
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return PLAYER_COLORS[h % PLAYER_COLORS.length]
}

export interface Explosion {
  cityId: string
  at: number
  result: string
}

export interface UIState {
  selectedCityId: string | null
  attackFrom: string | null // attack mode with origin city
  claimMode: boolean
  showLeaderboard: boolean
  showHelp: boolean
  showFeed: boolean
  wifAction: { kind: 'speedup' | 'airlift' | 'shock'; cityId?: string } | null
  reportLog: BattleLog | null
  reportKey: string | null
  reportDismissed: string | null
}

interface GameStore {
  connected: boolean
  booted: boolean
  token: string | null
  player: PlayerInfoLike | null
  chain: Snapshot['chain'] | null
  cities: Snapshot['cities']
  battles: Snapshot['battles']
  events: Snapshot['events']
  gameState: { tick: number; wifBurned: number; seasonStart: string | null }
  leaderboard: Snapshot['leaderboard']
  playerNames: Record<string, string>
  lastReportLog: BattleLog | null
  explosions: Explosion[]
  ui: UIState

  applySnapshot: (s: Snapshot, opts?: { keepSelection?: boolean }) => void
  setConnected: (v: boolean) => void
  setBoot: (v: boolean) => void
  setToken: (t: string | null) => void
  patchPlayer: (p: Partial<PlayerInfoLike> & { id: string }) => void
  updateCities: (cities: Snapshot['cities']) => void
  upsertBattle: (b: Snapshot['battles'][number]) => void
  removeBattle: (id: string) => void
  setEvents: (e: Snapshot['events']) => void
  setGameState: (g: { tick: number; wifBurned: number }) => void
  setLeaderboard: (rows: Snapshot['leaderboard']) => void
  mergePlayers: (players: { id: string; name: string }[]) => void
  pushExplosion: (e: Explosion) => void
  setUi: (patch: Partial<UIState>) => void
  logout: () => void
}

type PlayerInfoLike = Snapshot['player']

const TOKEN_KEY = 'flatwar_token'

export const useGame = create<GameStore>((set, get) => ({
  connected: false,
  booted: false,
  token: typeof window !== 'undefined' ? localStorage.getItem(TOKEN_KEY) : null,
  player: null,
  chain: null,
  cities: [],
  battles: [],
  events: [],
  gameState: { tick: 0, wifBurned: 0, seasonStart: null },
  leaderboard: [],
  playerNames: {},
  lastReportLog: null,
  explosions: [],
  ui: {
    selectedCityId: null,
    attackFrom: null,
    claimMode: false,
    showLeaderboard: false,
    showHelp: false,
    showFeed: typeof window !== 'undefined' ? window.innerWidth >= 640 : true,
    wifAction: null,
    reportLog: null,
    reportKey: null,
    reportDismissed: null,
  },

  applySnapshot: (s, opts) => {
    const prevSelected = get().ui.selectedCityId
    set((st) => ({
      player: s.player,
      chain: s.chain,
      cities: s.cities,
      battles: s.battles,
      events: s.events,
      gameState: s.gameState,
      leaderboard: s.leaderboard,
      playerNames: s.playerNames,
      token: s.player?.token ?? st.token,
      connected: true,
      ui: { ...st.ui, selectedCityId: opts?.keepSelection ? prevSelected : st.ui.selectedCityId },
    }))
    if (s.player?.token) localStorage.setItem(TOKEN_KEY, s.player.token)
    set({ booted: true })
  },
  setConnected: (v) => set({ connected: v }),
  setBoot: (v) => set({ booted: v }),
  setToken: (t) => {
    if (t) localStorage.setItem(TOKEN_KEY, t)
    else localStorage.removeItem(TOKEN_KEY)
    set({ token: t })
  },
  patchPlayer: (p) =>
    set((st) => (st.player && st.player.id === p.id ? { player: { ...st.player, ...p } } : st)),
  updateCities: (cities) =>
    set((st) => {
      const map = new Map(st.cities.map((c) => [c.id, c]))
      for (const c of cities) map.set(c.id, c)
      return { cities: Array.from(map.values()) }
    }),
  upsertBattle: (b) =>
    set((st) => {
      const others = st.battles.filter((x) => x.id !== b.id)
      return { battles: [...others, b] }
    }),
  removeBattle: (id) => set((st) => ({ battles: st.battles.filter((b) => b.id !== id) })),
  setEvents: (e) => set({ events: e }),
  setGameState: (g) => set((st) => ({ gameState: { ...st.gameState, ...g } })),
  setLeaderboard: (rows) => set({ leaderboard: rows }),
  mergePlayers: (players) =>
    set((st) => {
      const names = { ...st.playerNames }
      let mine = st.player
      for (const p of players) {
        names[p.id] = p.name
        if (st.player && p.id === st.player.id) {
          mine = { ...st.player, ...(p as Partial<PlayerInfoLike>) }
        }
      }
      return { playerNames: names, player: mine }
    }),
  pushExplosion: (e) =>
    set((st) => ({ explosions: [...st.explosions.filter((x) => Date.now() - x.at < 2500), e] })),
  setUi: (patch) => set((st) => ({ ui: { ...st.ui, ...patch } })),
  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, player: null, ui: { ...get().ui, selectedCityId: null, claimMode: false, attackFrom: null } })
  },
}))

// ─── HTTP polling transport ──────────────────────────────────────────────────

let pollTimer: ReturnType<typeof setInterval> | null = null
let pollInFlight = false
const seenReports = new Set<string>()
let firstSyncDone = false

function ingestReports(reports: ReportInfo[]) {
  const st = useGame.getState()
  const fresh: ReportInfo[] = []
  for (const r of reports) {
    if (!seenReports.has(r.id)) {
      seenReports.add(r.id)
      fresh.push(r)
    }
  }
  if (!fresh.length) return

  // first sync after (re)load: don't replay old battles, just mark seen
  if (!firstSyncDone) return

  const me = st.player?.id
  let shown = false
  for (const r of fresh) {
    // explosion for every battle — the world feels alive
    st.pushExplosion({ cityId: r.toCityId, at: Date.now(), result: r.result })
    // battle report dialog only for my own fights
    if (me && (r.attackerId === me || r.defenderId === me) && r.log) {
      const key = `${r.id}-${r.log.result}`
      useGame.setState({
        lastReportLog: { ...r.log, result: r.result },
        ui: { ...useGame.getState().ui, reportLog: { ...r.log, result: r.result }, reportKey: key, reportDismissed: null },
      })
      shown = true
    }
  }
  void shown
}

async function pollOnce() {
  if (pollInFlight) return
  pollInFlight = true
  try {
    const token = useGame.getState().token
    const snap = await apiState(token)
    ingestReports(snap.reports ?? [])
    firstSyncDone = true
    useGame.getState().applySnapshot(snap, { keepSelection: true })
  } catch {
    useGame.getState().setConnected(false)
  } finally {
    pollInFlight = false
  }
}

/** Boots the polling loop: instant sync + refresh every 2.5s. */
export function wirePolling() {
  void pollOnce()
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(pollOnce, 2500)
}

/** Forces an immediate sync (after actions etc.). */
export function syncNow() {
  void pollOnce()
}
