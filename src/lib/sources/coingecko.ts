import { getJSON, sleep } from "./http";

/**
 * CoinGecko public API.
 *
 * The news endpoint (/news) is PRO-only — it answers 401 with error 10005 on
 * the free tier — so nothing here attempts news. What the free tier does give,
 * and what this module reads, is the coin record: its tickers are a complete
 * venue list, which is the only free source of exchange listings we have.
 *
 * Free-tier limits are roughly 10-30 calls a minute and are enforced by IP, so
 * every call here is spaced. A COINGECKO_KEY (free demo key) raises the ceiling.
 */
const KEY = process.env.COINGECKO_KEY;
const BASE = "https://api.coingecko.com/api/v3";
const HEADERS: Record<string, string> = KEY ? { "x-cg-demo-api-key": KEY } : {};

/** Spacing between calls; the free tier throttles hard on bursts. */
const GAP_MS = KEY ? 2200 : 6000;

export interface Listing {
  exchange: string;
  /** e.g. "META/USDC" — symbols as the venue reports them. */
  pair: string;
  volumeUsd: number | null;
  /** CoinGecko's own confidence in the venue's reported volume. */
  trust: string | null;
  url: string | null;
  isDex: boolean;
}

/**
 * CoinGecko's coin id for a Solana mint.
 *
 * `failed` separates "this token is not listed" (a fact — CoinGecko listing is a
 * curation step most of this book has not been through) from "the lookup broke"
 * (rate limit, timeout). Callers must not treat the second as the first: doing
 * so once overwrote MetaDAO's Upbit and Coinbase listings with DEX-only pool
 * data, silently deleting the only centralised venues on the page.
 */
export async function coinIdByContract(mint: string): Promise<{ id: string | null; failed: boolean }> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/coins/solana/contract/${mint}`, {
      headers: { accept: "application/json", ...HEADERS },
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    await sleep(GAP_MS);
    return { id: null, failed: true };
  }
  await sleep(GAP_MS);
  // 404 is the authoritative "not listed"; anything else non-OK is a failure.
  if (res.status === 404) return { id: null, failed: false };
  if (!res.ok) return { id: null, failed: true };
  try {
    const data = (await res.json()) as { id?: string };
    return { id: data?.id ?? null, failed: false };
  } catch {
    return { id: null, failed: true };
  }
}

interface Ticker {
  base?: string; target?: string;
  market?: { name?: string; identifier?: string; has_trading_incentive?: boolean };
  converted_volume?: { usd?: number };
  trust_score?: string | null;
  trade_url?: string | null;
}

/**
 * Every venue CoinGecko sees trading this token, best volume first.
 *
 * Tickers repeat per pool on DEXes, so identical (venue, pair) rows are merged
 * — otherwise Meteora alone would appear four times and read as four listings.
 */
export async function coinListings(id: string): Promise<Listing[] | null> {
  const data = await getJSON<{ tickers?: Ticker[] }>(
    `${BASE}/coins/${id}?localization=false&tickers=true&market_data=false&community_data=false&developer_data=false&sparkline=false`,
    { headers: HEADERS, retries: 1, timeoutMs: 15000 }
  );
  await sleep(GAP_MS);
  // null means the call failed; an empty array means listed but traded nowhere.
  if (!data) return null;
  if (!data.tickers) return [];

  const merged = new Map<string, Listing>();
  for (const t of data.tickers) {
    const exchange = t.market?.name?.trim();
    if (!exchange) continue;

    // A venue quoting raw mint addresses is trading on-chain, whatever it is
    // called. Name matching alone mislabels order-book DEXes such as Manifest
    // as centralised, which overstates how many real CEX listings a token has.
    const isMint = (s?: string) => !!s && s.length >= 30 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(s);
    const onChain =
      isMint(t.base) || isMint(t.target) ||
      /\b(amm|swap|dex|meteora|raydium|orca|jupiter|omnipair|manifest|phoenix|lifinity)\b/i.test(exchange);

    // Raw mints are unreadable next to "META/USDC", so shorten for display.
    const short = (s?: string) => (s && s.length > 12 ? `${s.slice(0, 4)}…${s.slice(-3)}` : s ?? "?");
    const pair = `${short(t.base)}/${short(t.target)}`;
    const key = `${exchange}|${pair}`;
    const vol = t.converted_volume?.usd ?? null;
    const existing = merged.get(key);
    if (existing) {
      // Same venue and pair across several pools — one listing, summed volume.
      existing.volumeUsd = (existing.volumeUsd ?? 0) + (vol ?? 0);
      continue;
    }
    merged.set(key, {
      exchange,
      pair,
      volumeUsd: vol,
      trust: t.trust_score ?? null,
      url: t.trade_url ?? null,
      isDex: onChain,
    });
  }
  return [...merged.values()].sort((a, b) => (b.volumeUsd ?? 0) - (a.volumeUsd ?? 0));
}
