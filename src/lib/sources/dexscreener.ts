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

/** Free, no key. Best pair (deepest liquidity) for a mint on Solana. */
export async function bestPairForMint(mint: string): Promise<DexPair | null> {
  const data = await getJSON<{ pairs: DexPair[] | null }>(
    `https://api.dexscreener.com/latest/dex/tokens/${mint}`
  );
  const pairs = (data?.pairs ?? []).filter((p) => p.chainId === "solana");
  if (!pairs.length) return null;
  pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return pairs[0];
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
