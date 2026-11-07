// ─── Flat War — game balance & chain constants (server) ──────────────────────

// Robinhood Chain mainnet
export const CHAIN = {
  chainId: 4663,
  chainIdHex: '0x1237',
  chainName: 'Robinhood Chain',
  rpcUrl: 'https://rpc.mainnet.chain.robinhood.com',
  explorer: 'https://robinhoodchain.blockscout.com',
  nativeCurrency: { name: 'Ethereum', symbol: 'ETH', decimals: 18 },
}

// $WIF token on Robinhood Chain
export const WIF = {
  address: '0x5173b8ea6923c2d40267890d45c46a3480954773',
  symbol: 'WIF',
  name: 'World is Flat',
  decimals: 18,
}

export const BURN_ADDRESS = '0x000000000000000000000000000000000000dEaD'

// $WIF burn prices (whole WIF per action)
export const WIF_PRICES = {
  speedup: 3, // finish current build/train instantly
  airlift: 5, // instant 400 troops to one of your cities
  shock: 2, // x2 attack power for the next battle (10 min)
}

export const TICK_MS = 10_000

// production per tick (10s)
export const RATE = {
  minePerLevel: 3, // iron / tick / level
  derrickPerLevel: 2, // oil / tick / level
  factoryAmmoPerLevel: 1, // ammo / tick / level
  factoryIronPerAmmo: 2,
  factoryOilPerAmmo: 1,
  neutralRegen: 3, // militia regen / tick while neutral
}

// building costs per target level L: {iron, oil, ammo}
export const BUILD = {
  cost: {
    mine: (L: number) => ({ iron: 80 * L, oil: 0, ammo: 0 }),
    derrick: (L: number) => ({ iron: 60 * L, oil: 0, ammo: 0 }),
    factory: (L: number) => ({ iron: 60 * L, oil: 40 * L, ammo: 0 }),
    barracks: (L: number) => ({ iron: 70 * L, oil: 0, ammo: 30 * L }),
    bunker: (L: number) => ({ iron: 100 * L, oil: 20 * L, ammo: 0 }),
  },
  durationSec: (L: number) => 45 * L,
  maxLevel: 5,
  kinds: ['mine', 'derrick', 'factory', 'barracks', 'bunker'] as const,
}

// training: 100 troops costs {iron, ammo, oil}; duration scales with barracks
export const TRAIN = {
  costPer100: { iron: 150, ammo: 100, oil: 50 },
  baseDurationSec: 90,
  levelSpeedup: 0.15, // -15% per barracks level
}

export const START = {
  iron: 500,
  oil: 250,
  ammo: 150,
  capitalTroops: 150,
  capitalBuildings: { mine: 1, derrick: 1, factory: 1, barracks: 1, bunker: 0 },
}

export const MILITIA = { 1: 600, 2: 260, 3: 90 } as Record<number, number>

export const COMBAT = {
  ammoPerTroop: 0.4,
  maxRangeKm: 1400,
  travelBaseSec: 45,
  travelSecPerKm: 1 / 25,
  defenseBunkerBonus: 0.22,
  capitalDefenseBonus: 1.5,
  shockMultiplier: 2,
  shockDurationMs: 10 * 60_000,
  variance: 0.15,
  winLossRate: [1.6, 2.0] as [number, number],
  occupyKeepRatio: 0.8,
  retreatRatio: 0.3,
}

export const AIRLIFT_TROOPS = 400
