import { getJSON } from "./http";

export interface DexPair {
  chainId: string;
  dexId: string;
  pairAddress: string;
  baseToken: { address: string; name: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  fdv?: number;
  marketCap?: number;
  volume?: { h24?: number };
  priceChange?: { h1?: number; h24?: number };
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: { url: string }[];
    socials?: { type: string; url: string }[];
  };
}

/**
 * One mint per request, several requests in flight.
 *
 * The comma-separated form of this endpoint looks like the obvious batch, but
 * its cap is 30 *pairs* rather than 30 tokens — 19 mints came back covering
 * only 11 of them, and the uncovered ones fail silently as "no market". The
 * `tokens/v1` batch does return one row per token, but that row is not
 * necessarily the deepest pool (it quoted META's $342K pair over its $2.67M
 * one), which would understate depth and trip the thin-liquidity gate.
 */
const CONCURRENCY = 8;

/**
 * Free, no key. Deepest-liquidity Solana pair per mint, keyed by mint.
 *
 * A response carries every pair the mint appears in — including ones where it
 * is the *quote* side (anything trading against META comes back on a META
 * query). Those quote a different asset entirely, so matching on
 * `baseToken.address` is what keeps a thin XYZ/META pool from being read as
 * the price of META.
 */
export async function pairsForMints(
  mints: string[],
  opts: { retries?: number; timeoutMs?: number } = {}
): Promise<Map<string, DexPair>> {
  const best = new Map<string, DexPair>();
  const queue = [...mints];

  const worker = async () => {
    for (let mint = queue.pop(); mint != null; mint = queue.pop()) {
      const data = await getJSON<{ pairs: DexPair[] | null }>(
        `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
        opts
      );
      let top: DexPair | undefined;
      for (const p of data?.pairs ?? []) {
        if (p.chainId !== "solana" || p.baseToken?.address !== mint) continue;
        if (!top || (p.liquidity?.usd ?? 0) > (top.liquidity?.usd ?? 0)) top = p;
      }
      if (top) best.set(mint, top);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker)
  );
  return best;
}

/** Free, no key. Best pair (deepest liquidity) for a mint on Solana. */
export async function bestPairForMint(mint: string): Promise<DexPair | null> {
  return (await pairsForMints([mint])).get(mint) ?? null;
}

export function socialsFromPair(pair: DexPair): {
  website?: string; twitter?: string; telegram?: string; discord?: string; image?: string;
} {
  const out: Record<string, string> = {};
  if (pair.info?.imageUrl) out.image = pair.info.imageUrl;
  if (pair.info?.websites?.[0]?.url) out.website = pair.info.websites[0].url;
  for (const s of pair.info?.socials ?? []) {
    if (s.type === "twitter") out.twitter = s.url;
    if (s.type === "telegram") out.telegram = s.url;
    if (s.type === "discord") out.discord = s.url;
  }
  return out;
}
