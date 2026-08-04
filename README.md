# OwnTmrw — Own Tomorrow

The MetaDAO intelligence terminal. Institutional-grade research on every project launched
through **MetaDAO** and **Futard** — one permanent profile per project covering raise, market,
holders, treasury, governance, development, community and news, aggregated automatically from
public sources only.

> Bloomberg Terminal for MetaDAO. Not another explorer.

## Stack

- **Next.js 16** (App Router, Turbopack) + Tailwind v4 — dark, dense, institutional UI
- **SQLite** (`better-sqlite3`) — permanent local intelligence store (`data/metaintel.db`)
- **lightweight-charts** — TradingView-grade price charts with event overlays
- **Ingestion engine** (`scripts/ingest.ts`) — no proprietary API keys required

## Public data sources

| Source | What we pull | Key needed |
|---|---|---|
| MetaDAO launchpad / on-chain | project registry, raises, DAOs, proposals | no |
| DexScreener API | live price, mcap, FDV, liquidity, volume, socials | no |
| GeckoTerminal API | daily OHLCV history (up to ~1000d), holder counts, token metadata | no |
| Solana RPC (public mainnet) | supply, top-20 token accounts, owner resolution | no |
| Jupiter lite price API | batch USD prices (META/SOL benchmarks) | no |
| GitHub API | org stars/forks/repos, releases, last push | optional (`GITHUB_TOKEN` raises limits) |

## Run it

```bash
npm install
npm run ingest      # pull everything (first run takes a few minutes — public rate limits)
npm run dev         # http://localhost:3000
```

`npm run ingest -- --fast` refreshes prices only. Re-run ingest on a schedule (cron)
to build up holder/price/dev history — every run appends snapshots, nothing is deleted.

Optional env: `SOLANA_RPC_URL` (defaults to public mainnet), `GITHUB_TOKEN`.

## Data correctness

Three rules the platform enforces so nothing shown is fabricated:

1. **Market cap uses MetaDAO's circulating supply**, FDV uses total supply. DexScreener reports
   FDV as `marketCap` for most of these tokens, which overstated Umbra, Solomon and P2P by ~2x
   because their team performance packages are still locked.
2. **Raise figures come from the on-chain launch records** (`src/lib/sources/raises.ts`), one
   citation per project. MetaDAO exposes no raise API and its site sits behind a bot wall, so
   these are read from archived snapshots that server-render the raw launch structs — exact
   `committedAmount` / `finalRaiseAmount` values, not rounded press figures. Committed is always
   distinguished from accepted (MetaDAO auto-refunds the excess; Umbra kept $3M of $154.9M).
   Curated sales are a fixed 10M-token bucket, so price and amount imply each other — derived
   only through that documented rule, never for permissionless launches or unpublished amounts.
3. **Return metrics are withheld below $10k of liquidity.** A price quoted off a $5k pool isn't
   a real market price, so ROI/ATH figures are suppressed and the project page says why.

## What's inside

- `/` — screener: sortable/filterable across price, ROI vs raise, ATH return, holders, liquidity, governance and GitHub activity
- `/project/[slug]` — the intelligence profile: stat tiles, price history with event markers (raise closed, launch, proposals, releases), holder intelligence with wallet labels, governance, development, AI signals, full event timeline
- `/timeline` — ecosystem-wide chronological event feed
- `/observations` — automatically generated signals ("volume up 82% WoW", "top 10 hold 61% of supply")
- Global search — projects, tokens, wallets, proposals

## Architecture

```
scripts/ingest.ts          ingestion pipeline (discovery → market → history → holders → github → signals)
src/lib/sources/           one client per public source (metadao, dexscreener, geckoterminal, rpc, github, jupiter)
src/lib/db.ts              schema + migrations (projects, snapshots, candles, holders, proposals, events, observations)
src/lib/queries.ts         read-side queries for the UI
src/app/                   Next.js App Router pages (server components read SQLite directly)
```
