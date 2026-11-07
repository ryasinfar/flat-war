// ─── Flat War shared client types (mirror of server public shapes) ──────────

export interface BuildTask { kind: string; targetLevel: number; readyAt: number }
export interface TrainTask { amount: number; readyAt: number }

export interface City {
  id: string
  name: string
  country: string
  cc: string
  lat: number
  lon: number
  tier: number
  ownerId: string | null
  isCapital: boolean
  troops: number
  b: { mine: number; derrick: number; factory: number; barracks: number; bunker: number }
  buildTask: BuildTask | null
  trainTask: TrainTask | null
}

export interface PlayerInfo {
  id: string
  address: string
  name: string
  iron: number
  oil: number
  ammo: number
  shockUntil: string | null
  isGuest: boolean
  wifSpent: number
  token?: string
}

export interface BattleInfo {
  id: string
  fromCityId: string
  toCityId: string
  attackerId: string
  troops: number
  arriveAt: string
  createdAt?: string
}

export interface BattleLog {
  attacker: string
  defender: string
  city: string
  troopsSent: number
  defenders: number
  atkPower: number
  defPower: number
  atkLosses: number
  defLosses: number
  shock: boolean
  capitalBonus: boolean
  result?: string
}

export interface GameEvent {
  id: number
  kind: string
  text: string
  createdAt: string
}

export interface LeaderRow {
  id: string
  name: string
  cities: number
  troops: number
  power: number
  wifSpent: number
}

export interface ChainInfo {
  chainId: number
  chainIdHex: string
  chainName: string
  rpcUrl: string
  explorer: string
  wif: { address: string; symbol: string; name: string; decimals: number }
  burn: string
  prices: { speedup: number; airlift: number; shock: number }
}

export interface ReportInfo {
  id: string
  fromCityId: string
  toCityId: string
  attackerId: string
  defenderId: string | null
  result: string
  at: string
  log: BattleLog
}

export interface Snapshot {
  player: PlayerInfo | null
  cities: City[]
  battles: BattleInfo[]
  events: GameEvent[]
  gameState: { tick: number; wifBurned: number; seasonStart: string | null }
  leaderboard: LeaderRow[]
  playerNames: Record<string, string>
  reports: ReportInfo[]
  chain: ChainInfo
}
