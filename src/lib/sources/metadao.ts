import { getJSON, sleep } from "./http";

/**
 * MetaDAO's official public API (deployed futarchy-external-api).
 * No key; ~60 req/min/IP; requires a browser-like User-Agent (403 otherwise).
 */
const MARKET_API = "https://market-api.metadao.fi";
const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

export const FUTARCHY_PROGRAM = "FUTARELBfJfQ8RDGhg1wdhddq1odMAJUePHFuBYfUxKq";
export const LAUNCHPAD_PROGRAMS = [
  "moonDJUoHteKkGATejA5bdJVwJ6V6Dg74gyqyJTx73n", // v0.8
  "moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM", // v0.7
  "MooNyh4CBUYEKyXVnjGYQ8mEiJDpGvJMdvrZx1iGeHV", // v0.6
  "mooNhciQJi1LqHDmse2JPic2NqG2PXCanbE3ZYzP3qA", // v0.5
];

interface Ticker {
  ticker_id: string;
  base_currency: string;
  base_symbol: string;
  base_name: string;
  pool_id: string;
  last_price: string;
  liquidity_in_usd: string;
  treasury_usdc_aum: string;
  treasury_vault_address: string;
  startDate: string;
}

export interface DiscoveredProject {
  slug: string; name: string; symbol: string;
  mint?: string; status: string; category?: string;
  pool_address?: string; treasury_address?: string;
  launch_ts?: number; description?: string;
  website?: string; twitter?: string; github?: string; docs?: string;
  raise_amount_usd?: number; raise_goal_usd?: number; raise_end_ts?: number;
  treasury_value_usd?: number;
  source: string;
}

/**
 * Curated registry: knowledge the APIs don't expose — descriptions, links,
 * failed raises, tokens missing from the tickers feed. Live data overlays this.
 */
const CURATED: DiscoveredProject[] = [
  {
    slug: "metadao", name: "MetaDAO", symbol: "META",
    mint: "METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta",
    status: "live", category: "Governance / Launchpad",
    description:
      "The futarchy protocol itself — a launchpad and governance system on Solana where markets, not votes, make decisions. Every project tracked here launched through it.",
    website: "https://metadao.fi", twitter: "https://x.com/MetaDAOProject",
    github: "https://github.com/metaDAOproject", docs: "https://docs.metadao.fi",
    source: "curated",
  },
  {
    slug: "ranger", name: "Ranger", symbol: "RNGR",
    mint: "RNGRtJMbCveqCp7AC6U95KmrdKecFckaJZiWbPGmeta",
    status: "live", category: "Perps / Trading", source: "curated",
  },
  {
    slug: "zklsol", name: "ZKLSOL", symbol: "ZKFG",
    mint: "ZKFHiLAfAFMTcDAuCtjNW54VzpERvoe7PBF9mYgmeta",
    status: "live", category: "LST / ZK", source: "curated",
  },
  {
    slug: "hurupay", name: "Hurupay", symbol: "HURU",
    status: "failed", category: "Payments",
    description:
      "First failed MetaDAO ICO — $2.0M committed against a $3M minimum (Feb 2026); every contribution was refunded and no token went live.",
    source: "curated",
  },
];

/** Extra metadata for projects the tickers feed does list. */
const ENRICH: Record<string, Partial<DiscoveredProject>> = {
  UMBRA: { category: "Privacy" },
  AVICI: { category: "Banking" },
  LOYAL: { category: "Consumer" },
  PAYS: { category: "Payments / Streaming" },
  SOLO: { category: "Credit" },
  FAF: { category: "Perps DEX", website: "https://flash.trade" },
  OMFG: { category: "Lending / AMM" },
  FUTARDIO: { category: "Community / Cult" },
  SUPER: { category: "Gaming" },
  P2P: { category: "P2P Markets" },
  RAWR: { category: "Consumer" },
  GSIM: { category: "DePIN / eSIM" },
  ARL: { category: "RWA / Real Estate" },
  LASO: { category: "Lending" },
  CRED: { category: "Credit / Lending" },
  CARS: { category: "RWA / Consumer" },
  META: { category: "Governance / Launchpad" },
};

export async function fetchTickers(): Promise<Ticker[]> {
  const data = await getJSON<Ticker[]>(`${MARKET_API}/api/tickers`, {
    headers: { "user-agent": BROWSER_UA },
  });
  await sleep(1100); // ≤60 req/min
  return Array.isArray(data) ? data : [];
}

export interface SupplyInfo {
  totalSupply: number | null;
  circulatingSupply: number | null;
  /** Tokens locked in the team performance package (vesting, not circulating). */
  teamPackage: number | null;
  /**
   * The vault holding that package. It is the single largest holder of most
   * launches, so without it the terminal's top holder is an unidentified whale
   * sitting on half the supply — which is a locked allocation, not a position.
   */
  teamAddress: string | null;
  /** Tokens seeded into the futarchy AMM + Meteora LP. */
  liquidity: number | null;
  /** Vault behind the futarchy AMM's share of that liquidity. */
  ammVaultAddress: string | null;
  /** MetaDAO's own Meteora pool, which need not be the venue DexScreener ranks first. */
  lpPoolAddress: string | null;
  daoAddress: string | null;
  launchAddress: string | null;
  version: string | null;
}

interface AllocEntry { amount?: string; address?: string; vaultAddress?: string; poolAddress?: string }

/**
 * Authoritative supply + allocation straight from MetaDAO.
 * Circulating excludes the team performance package, so market cap computed
 * from this is correct where DexScreener reports FDV.
 */
export async function fetchSupply(mint: string): Promise<SupplyInfo | null> {
  const data = await getJSON<{
    data?: {
      totalSupply?: string; circulatingSupply?: string;
      allocation?: Record<string, AllocEntry | string>;
    };
  }>(`${MARKET_API}/api/supply/${mint}`, { headers: { "user-agent": BROWSER_UA } });
  await sleep(1100);
  if (!data?.data) return null;
  const alloc = data.data.allocation ?? {};
  const entry = (k: string): AllocEntry | null => {
    const v = alloc[k];
    return v && typeof v === "object" ? v : null;
  };
  const num = (v: string | undefined) => (v != null && v !== "" ? Number(v) : null);

  const ammLiq = num(entry("futarchyAmmLiquidity")?.amount);
  const lpLiq = num(entry("meteoraLpLiquidity")?.amount);
  const liquidity =
    ammLiq != null || lpLiq != null ? (ammLiq ?? 0) + (lpLiq ?? 0) : null;

  return {
    totalSupply: num(data.data.totalSupply),
    circulatingSupply: num(data.data.circulatingSupply),
    teamPackage: num(entry("teamPerformancePackage")?.amount),
    teamAddress: entry("teamPerformancePackage")?.address ?? null,
    liquidity,
    ammVaultAddress: entry("futarchyAmmLiquidity")?.vaultAddress ?? null,
    lpPoolAddress: entry("meteoraLpLiquidity")?.poolAddress ?? null,
    daoAddress: entry("daoAddress")?.address ?? (typeof alloc.daoAddress === "string" ? alloc.daoAddress : null),
    launchAddress: entry("launchAddress")?.address ?? (typeof alloc.launchAddress === "string" ? alloc.launchAddress : null),
    version: typeof alloc.version === "string" ? alloc.version : null,
  };
}

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Discovery: official tickers feed overlaid on the curated registry. */
export async function discoverProjects(): Promise<DiscoveredProject[]> {
  const bySlug = new Map<string, DiscoveredProject>();
  const byMint = new Map<string, string>(); // mint → slug
  for (const c of CURATED) {
    bySlug.set(c.slug, { ...c });
    if (c.mint) byMint.set(c.mint, c.slug);
  }

  const tickers = await fetchTickers();
  for (const t of tickers) {
    const slug = byMint.get(t.base_currency) ?? slugify(t.base_name || t.base_symbol);
    const launch_ts = t.startDate ? Math.floor(Date.parse(`${t.startDate}T00:00:00Z`) / 1000) : undefined;
    const enrich = ENRICH[t.base_symbol] ?? {};
    const existing = bySlug.get(slug);
    bySlug.set(slug, {
      ...enrich,
      ...(existing ?? {}),
      slug, name: t.base_name || t.base_symbol, symbol: t.base_symbol,
      mint: t.base_currency, status: "live",
      pool_address: t.pool_id || undefined,
      treasury_address: t.treasury_vault_address || undefined,
      treasury_value_usd: Number(t.treasury_usdc_aum) || undefined,
      launch_ts,
      category: existing?.category ?? enrich.category,
      source: "metadao-market-api",
    });
  }
  return Array.from(bySlug.values());
}
