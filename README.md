# 🌍⚔️ FLAT WAR

**A persistent multiplayer war game on Robinhood Chain. Claim cities. Build armies. Burn $WIF to conquer the flat world.**

Built for the **World is Flat hackathon**.

## the game

- **claim a city** — pick any free city on the world map as your capital
- **build** — iron mines, oil derricks, ammo/weapon factories (each takes real time)
- **produce** — every 10-second tick, your cities produce resources and your barracks train troops
- **conquer** — attack adjacent cities; battles consume troops + ammo; winners take the city's industry
- **defend** — bunkers, air defences and garrisons protect what you hold
- **burn $WIF for power** — three tactical boosts, all paid with real on-chain $WIF burns:
  - **speedup** (3 $WIF) — finish a build instantly
  - **airlift** (5 $WIF) — drop 400 reinforcements into a besieged city
  - **shock** (2 $WIF) — 2× attack power for your next battle

Playing is **free**. $WIF burns are optional power moves — they buy **time and tactics, never resources or armies**, so the game is never pay-to-win.

## real $WIF, real chain

Every burn is **verified on-chain** before the game applies any effect:

| | |
|---|---|
| chain | Robinhood Chain (chain id `4663`) |
| $WIF token | [`0x5173b8ea6923c2d40267890d45c46a3480954773`](https://robinhoodchain.blockscout.com/token/0x5173b8ea6923c2d40267890d45c46a3480954773) |
| burn address | `0x000000000000000000000000000000000000dEaD` |

The backend reads the actual `Transfer` logs of the burn transaction via RPC (`eth_getTransactionReceipt`), checks that the correct amount of $WIF moved from the player's wallet to the burn address, and rejects replayed transactions. No burn, no boost — nothing can be faked.

## the flywheel

play → conquer → burn → get attacked → play again.

The map changes hands in real time. A visible war feed shows battles, conquests and burns as they happen. Seasons reset the board. Burns permanently remove $WIF from supply, in public, at every competitive peak.

## the stack

- **Next.js 16 (App Router) + TypeScript** — game client & API routes
- **pure-function tick engine** — deterministic `createInitialState() + step(state, config)` simulation, 10s server ticks
- **Prisma + SQLite** — persistent world state
- **real-time** — the map, war feed and city states stream to every client
- **wallet login** — sign-in-with-Ethereum (nonce + signature), no custody ever taken
- **on-chain verification** — RPC reads against Robinhood Chain for burn proof

## run it

```bash
bun install
# sqlite database url, e.g. file:./db/dev.db
echo 'DATABASE_URL="file:./db/dev.db"' > .env
bun run db:push
bun run dev        # next.js on :3000
```

the war engine (`mini-services/game-server`) runs the ticks:

```bash
cd mini-services/game-server && bun install && bun run dev
```

## license

MIT. Not affiliated with, endorsed by, or officially connected with Robinhood Markets, Inc. $WIF comes with no promise of value or return.
