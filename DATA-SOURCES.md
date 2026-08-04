# Data source status

Which intelligence categories are blocked, why, and what actually works instead.
Every row below was tested live on 2026-08-04 — status codes are observed, not
assumed. Re-test before trusting any of it; these APIs change their terms often.

## The single highest-leverage fix

**Four Missing categories share one root cause and need no new code.**

`Top Holders`, `Holder Distribution`, `Whale Tracking` and `Smart Money` all
depend on `getTokenLargestAccounts`. That call is *already implemented* in
`src/lib/sources/rpc.ts`. It returns nothing because the default public RPC
throttles that specific method:

```
api.mainnet-beta.solana.com → {"code":429,"message":"Too many requests for a specific RPC call"}
```

`getTokenSupply` on the same endpoint works fine, so this is a per-method
restriction, not a dead endpoint. No keyless RPC tested allows it:

| RPC | Result |
|---|---|
| api.mainnet-beta.solana.com | 429 on this method |
| solana-rpc.publicnode.com | empty response |
| solana.drpc.org | "chain is not available on free plan" |
| rpc.ankr.com/solana | error |
| endpoints.omniatech.io | 521 |

**Fix:** set `SOLANA_RPC_URL` (the env var `rpc.ts` already reads) to a provider
with a free API key — Helius, QuickNode, Alchemy or Shyft all offer one. Helius'
free tier is ~100k credits/month, ample for 20 tokens, and its DAS
`getTokenAccounts` returns the *full* holder list rather than just the top 20,
which is what `Holder Distribution` needs to compute top-10 / top-20 percentages.

Not verified here — it needs a key to test. Confirm before relying on it.

## Works today, keyless

| Category | Source | Endpoint | Verified |
|---|---|---|---|
| Risk Score | RugCheck | `api.rugcheck.xyz/v1/tokens/{mint}/report/summary` | 200 — returns `risks[]`, `score_normalised`, `lpLockedPct` |
| Risk Score | GoPlus | `api.gopluslabs.io/api/v1/solana/token_security?contract_addresses={mint}` | 200 — authorities, creators, DEX detail |
| Exchange Listings | CoinGecko | `/coins/{id}` with `tickers=true` | 200 — **implemented** |
| News | Publisher RSS | CoinDesk, Cointelegraph, Decrypt, Blockworks, CryptoSlate | 200 — **implemented** |
| Governance (partial) | Realms | `app.realms.today/api/splGovernancePrograms` | 200 — returns program IDs only; proposals still need on-chain reads |

RugCheck is the best single unblock after the RPC key: one keyless call per mint
fills a Missing category outright. For META it already reports "Mint Authority
still enabled" as a danger, which is a material risk fact the terminal does not
currently surface anywhere.

## Blocked, with the reason

| Category | Source tried | Result |
|---|---|---|
| News | CoinGecko `/news` | **401**, `error_code 10005` — PRO subscribers only |
| News | Google News RSS | 200 and excellent results, but the feed's own copyright restricts it to "personal, non-commercial use… any other use is expressly prohibited". **Licence blocker, not a technical one.** Do not wire up without a decision on this. |
| News | CryptoPanic public RSS | Returns HTML, not a feed. Needs a registered free key. |
| News | The Block RSS | **403** |
| News | Project site RSS | **0 of 18** project sites publish a discoverable feed |
| Token Unlocks | DefiLlama `/emissions` | **402** — "Upgrade to the paid API plan" |
| Smart Money | Birdeye | **401** — key required; wallet endpoints are paid tier |
| Top Holders | Solscan public API | **404** — public API retired, now key-gated |
| Governance Proposals | MetaDAO `market-api.metadao.fi` | Only `/api/tickers` exists. `/api/proposals`, `/api/daos`, `/api/markets` all **404**. |
| Governance Proposals | `metadao.fi/api/proposals` | **429** |

### Gotcha worth remembering

`market-api.metadao.fi` returns `403 Unauthorized control access` to any request
without an `accept: application/json` header, regardless of user-agent. It is not
blocking bots — it is content negotiation. `getJSON` already sets that header, so
the existing integration is fine; ad-hoc curl probes will mislead you.

## Still needs a real source

- **Governance Proposals / Votes** — *Critical*. Also blocked upstream: `dao_address`
  is NULL for all 20 projects, so there is nothing to query even once a source is
  found. Realistic path is reading SPL Governance / MetaDAO futarchy program
  accounts via `getProgramAccounts`, which needs the same RPC key as above.
- **Token Unlocks** — DefiLlama went paid. No free alternative found.
- **Announcements** — X has no keyless read API and costs $200/mo; Discord needs a
  bot invited per server. GitHub releases are the only channel that will ever
  populate this, so the category cannot honestly exceed Sparse.
- **Partnerships** — no API exists; manual or RSS only.
- **GitHub for the other 19 projects** — not an API problem. Only `metadao` has a
  `github` URL on file. The blocker is *discovery*: scrape project homepages for
  `github.com/<owner>` links, and read `links.repos_url.github` from the free
  CoinGecko coin endpoint. Validate any candidate owner against the GitHub API
  before storing it.

## Priority order

1. Free RPC key → unblocks 4 categories, zero new code
2. RugCheck → 1 keyless call fills Risk Score
3. GitHub owner discovery → unblocks the Development tab for 19 projects
4. Governance via program accounts → hardest, needs `dao_address` backfilled first
