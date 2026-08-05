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
 * Quote assets, keyed by UPPERCASED mint.
 *
 * CoinGecko returns `base`/`target` as either a symbol or a contract address
 * depending on the ticker — so the same market arrives twice in two notations —
 * and it upper-cases the addresses, which base58 is not. Hence the uppercase
 * keys and the case-insensitive comparisons below: matching the real mint
 * spelling would never fire.
 */
const QUOTE_SYMBOLS: Record<string, string> = {
  EPJFWDD5AUFQSSQEM2QN1XZYBAPC8G4WEGGKZWYTDT1V: "USDC",
  SO11111111111111111111111111111111111111112: "SOL",
  ES9VMFRZACERMJFRF4H2FYD4KCONKY11MCCE8BENWNYB: "USDT",
  "9N4NBM75F5UI33ZBPYXN59EWSGE8CGSHTAETH5YFEJ9E": "BTC",
  "7VFCXTUXX5WJV5JADK17DUJ4KSGAU7UTNKJ4B963VOXS": "ETH",
};

/**
 * Every venue CoinGecko sees trading this token, best volume first.
 *
 * Tickers repeat per pool on DEXes, so identical (venue, pair) rows are merged
 * — otherwise Meteora alone would appear four times and read as four listings.
 *
 * Pass the token's own mint and symbol to make that merge work. Without them a
 * ticker quoting raw addresses reads as a different market from the identical
 * one quoting symbols — RAWR/USDC and 4K1M…ETA/EPJF…T1V are the same pool pair
 * — so the venue is listed twice and its volume split across both rows.
 */
export async function coinListings(
  id: string,
  token?: { mint?: string | null; symbol?: string | null }
): Promise<Listing[] | null> {
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
    // Deliberately not a base58 charset check. CoinGecko upper-cases addresses,
    // which turns wrapped SOL into SO111…, and base58 has no O — so the strict
    // test rejected it and the full 43 characters were printed as a "symbol".
    const isMint = (s?: string) => !!s && s.length >= 30 && /^[0-9A-Za-z]+$/.test(s);
    const onChain =
      isMint(t.base) || isMint(t.target) ||
      /\b(amm|swap|dex|meteora|raydium|orca|jupiter|omnipair|manifest|phoenix|lifinity)\b/i.test(exchange);

    // Name the asset where we can. A mint we cannot resolve is still shortened
    // rather than printed in full — unreadable beats unreadable and long — but
    // it stays distinct so two genuinely different assets never merge.
    const ownMint = token?.mint?.toUpperCase();
    const asset = (s?: string) => {
      if (!s) return "?";
      const up = s.toUpperCase();
      if (!isMint(s)) return up;
      if (QUOTE_SYMBOLS[up]) return QUOTE_SYMBOLS[up];
      if (ownMint && up === ownMint && token?.symbol) return token.symbol.toUpperCase();
      return `${up.slice(0, 4)}…${up.slice(-3)}`;
    };
    const pair = `${asset(t.base)}/${asset(t.target)}`;
    // Venues arrive spelled inconsistently ("Meteora DAMM V2" and "… v2"), so
    // the key folds case while the row keeps the first spelling seen.
    const key = `${exchange.toLowerCase()}|${pair.toUpperCase()}`;
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
