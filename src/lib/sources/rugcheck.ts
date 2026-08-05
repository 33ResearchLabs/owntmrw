import { getJSON, sleep } from "./http";

/**
 * RugCheck — contract risk and the token's holder list, keyless.
 *
 * This one call covers three categories that otherwise need a paid or
 * key-gated provider: the contract risk report, the top-20 holder list, and
 * enough of the distribution to compute concentration. `getTokenLargestAccounts`
 * on the public Solana RPC answers 429 for that method, and Solscan's public API
 * is retired, so this is currently the only free route to holder data.
 *
 * It reports token accounts, not wallets: `address` is the token account and
 * `owner` is the wallet behind it. Concentration must be measured per owner —
 * one wallet can hold several accounts and would otherwise be counted twice.
 */
const BASE = "https://api.rugcheck.xyz/v1";

export interface RiskFlag {
  name: string;
  description: string;
  level: string;
  score: number;
}

export interface RugHolder {
  /** The token account. */
  address: string;
  /** The wallet that owns it — the meaningful identity. */
  owner: string | null;
  uiAmount: number;
  pct: number;
  insider: boolean;
  /** Venue/protocol name when RugCheck recognises the account. */
  label: string | null;
}

export interface RugReport {
  score: number | null;
  /** 0-100, higher is safer. RugCheck's own normalisation. */
  scoreNormalised: number | null;
  rugged: boolean;
  /**
   * true = an authority address is set, false = explicitly revoked, null = the
   * report did not carry the field. Null must stay null: reporting "revoked"
   * for a token we never checked is a safety claim we cannot support.
   */
  mintAuthorityEnabled: boolean | null;
  freezeAuthorityEnabled: boolean | null;
  lpLockedPct: number | null;
  totalHolders: number | null;
  totalLpProviders: number | null;
  risks: RiskFlag[];
  holders: RugHolder[];
  /** Concentration by owner, not by token account. */
  top10Pct: number | null;
  top20Pct: number | null;
}

interface RawReport {
  score?: number;
  score_normalised?: number;
  rugged?: boolean;
  mintAuthority?: unknown;
  freezeAuthority?: unknown;
  /** The SPL mint account. This — not the top level — carries the authorities. */
  token?: { mintAuthority?: unknown; freezeAuthority?: unknown };
  totalHolders?: number;
  totalLPProviders?: number;
  risks?: { name?: string; description?: string; level?: string; score?: number }[];
  topHolders?: {
    address?: string; owner?: string; uiAmount?: number; pct?: number; insider?: boolean;
  }[];
  knownAccounts?: Record<string, { name?: string; type?: string }>;
  markets?: { lp?: { lpLockedPct?: number } }[];
}

/**
 * Is a mint or freeze authority still held?
 *
 * The authority is the address under `token`; the top-level field of the same
 * name is present but always null in this API version, so reading it reported
 * every token as revoked — including ones whose own risk flags said the mint
 * authority was live. Prefer `token`, fall back to the top level, and return
 * null when neither is present rather than defaulting to the safe-sounding
 * answer. An empty string is a revoked authority, not an address.
 */
function authorityEnabled(fromToken: unknown, fromTop: unknown): boolean | null {
  const v = fromToken !== undefined ? fromToken : fromTop;
  if (v === undefined) return null;
  return v !== null && v !== "";
}

export async function tokenReport(mint: string): Promise<RugReport | null> {
  const raw = await getJSON<RawReport>(`${BASE}/tokens/${mint}/report`, {
    retries: 1,
    timeoutMs: 20000,
  });
  await sleep(1200);
  if (!raw) return null;

  const known = raw.knownAccounts ?? {};
  const holders: RugHolder[] = (raw.topHolders ?? [])
    .filter((h) => h.address)
    .map((h) => ({
      address: h.address!,
      owner: h.owner ?? null,
      uiAmount: h.uiAmount ?? 0,
      pct: h.pct ?? 0,
      insider: !!h.insider,
      // RugCheck keys its labels by either the token account or the owner.
      label: known[h.address!]?.name ?? (h.owner ? known[h.owner]?.name : null) ?? null,
    }));

  // Collapse to wallets before measuring concentration: the same owner holding
  // three token accounts is one holder, not three.
  const byOwner = new Map<string, number>();
  for (const h of holders) {
    const key = h.owner ?? h.address;
    byOwner.set(key, (byOwner.get(key) ?? 0) + h.pct);
  }
  const ranked = [...byOwner.values()].sort((a, b) => b - a);
  const sum = (n: number) => (ranked.length ? ranked.slice(0, n).reduce((s, p) => s + p, 0) : null);

  return {
    score: raw.score ?? null,
    scoreNormalised: raw.score_normalised ?? null,
    rugged: !!raw.rugged,
    mintAuthorityEnabled: authorityEnabled(raw.token?.mintAuthority, raw.mintAuthority),
    freezeAuthorityEnabled: authorityEnabled(raw.token?.freezeAuthority, raw.freezeAuthority),
    lpLockedPct: raw.markets?.[0]?.lp?.lpLockedPct ?? null,
    totalHolders: raw.totalHolders ?? null,
    totalLpProviders: raw.totalLPProviders ?? null,
    risks: (raw.risks ?? []).map((r) => ({
      name: r.name ?? "unknown",
      description: r.description ?? "",
      level: r.level ?? "info",
      score: r.score ?? 0,
    })),
    holders,
    // Only meaningful when the list is long enough to cover that many wallets.
    top10Pct: ranked.length >= 10 ? sum(10) : null,
    top20Pct: ranked.length >= 20 ? sum(20) : null,
  };
}
