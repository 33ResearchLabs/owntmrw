/**
 * Raise registry.
 *
 * MetaDAO does not expose raise results through any public API (the
 * futarchy-public-api is auth-gated and metadao.fi sits behind a bot wall),
 * so ICO figures are recorded here from published sources, each with a
 * citation. Every field is optional — a missing number stays missing rather
 * than being interpolated, so the UI shows "—" instead of a fabricated value.
 *
 * `price` is the per-token ICO price in USD and is what drives ROI-vs-raise
 * and ATH-return across the platform.
 */
export interface RaiseRecord {
  symbol: string;
  /** USD actually raised (post-refund, the amount the project kept). */
  amountUsd?: number;
  /** Minimum/target the raise had to clear. */
  goalUsd?: number;
  /** USD committed by participants before refunds — MetaDAO raises are heavily oversubscribed. */
  committedUsd?: number;
  /** Per-token ICO price in USD. */
  price?: number;
  /** Valuation at the raise (FDV). */
  fdvUsd?: number;
  contributors?: number;
  /** ISO date the raise closed. */
  closed?: string;
  note?: string;
  /**
   * MetaDAO runs two tracks on the same protocol: a curated launchpad
   * (metadao.fi) and a permissionless one fronted by futard.io.
   */
  track?: "curated" | "permissionless";
  /** Raise failed to reach its minimum; everything was refunded. */
  failed?: boolean;
  /** Token exists but never ran a raise (e.g. airdrop distribution). */
  noRaise?: boolean;
  /** Settled amount is genuinely unpublished — never derive or display one. */
  amountUnknown?: boolean;
  /** Where these numbers came from. */
  sourceUrl?: string;
}

/** Archived on-chain launch records rendered by metadao.fi / futard.io. */
const ARCHIVE_INDEX =
  "https://web.archive.org/web/20260513182239id_/https://www.metadao.fi/projects";
const FUTARD_ARCHIVE =
  "https://web.archive.org/web/20260707222238id_/https://www.futard.io/";
/**
 * Read directly from MetaDAO's launchpad program (133 launch accounts, 785 bytes
 * each). Verified by decoding the live chain: committed amounts are u64 USDC
 * base units and reconcile to the cent against archived pages.
 */
const ONCHAIN = "https://solscan.io/account/moontUzsdepotRGe5xsfip7vLPTJnVuafqdUWexVnPM";
/**
 * A single launch's record, live rather than archived. Append the *launch
 * address* — the mint 404s. The page embeds the launch struct as JSON
 * (`minimumRaise`, `approvedAmount`, `finalRaiseAmount`, `committedAmount`,
 * `numFunders`, `isPermissionless`) and states its own price and FDV in prose,
 * so nothing here needs deriving through the 10M-token rule.
 *
 * Read the meta description with care: it quotes *committed*, not settled. It
 * calls ORDR a "$9.3M raise" where the project actually kept $150,000.
 */
const FUTARD_LAUNCH = "https://www.futard.io/launch/";

/**
 * Per docs.metadao.fi/how-launches-work/sale: every launchpad ICO sells exactly
 * 10,000,000 tokens at a uniform price, so price = accepted raise ÷ 10M.
 * Sales use a discretionary cap — the founder chooses how much of the committed
 * USDC to accept and the remainder is auto-refunded, which is why `committedUsd`
 * dwarfs `amountUsd` on most rows.
 */
export const ICO_TOKENS_SOLD = 10_000_000;

export const RAISES: RaiseRecord[] = [
  // --- Curated MetaDAO launchpad. Committed/accepted/funders come from the
  // on-chain launch records server-rendered into metadao.fi (archived), so they
  // are exact rather than rounded press figures.
  {
    symbol: "UMBRA", amountUsd: 3_000_000, goalUsd: 750_000, committedUsd: 154_943_746,
    price: 0.30, fdvUsd: 8_550_000, contributors: 10_519, closed: "2025-10-10",
    track: "curated",
    note: "The most oversubscribed raise on the platform — $154.9M committed against a $3M cap, so ~98% was refunded.",
    sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "AVICI", amountUsd: 3_500_000, goalUsd: 2_000_000, committedUsd: 34_230_976,
    price: 0.35, fdvUsd: 4_515_000, contributors: 7_352, closed: "2025-10-18",
    track: "curated", sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "LOYAL", amountUsd: 2_500_000, goalUsd: 500_000, committedUsd: 75_898_233,
    price: 0.25, fdvUsd: 5_250_000, contributors: 5_058, closed: "2025-10-23",
    track: "curated", sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "ZKFG", amountUsd: 969_420, goalUsd: 300_000, committedUsd: 14_886_359,
    price: 0.096942, fdvUsd: 2_500_000, contributors: 2_290, closed: "2025-10-24",
    track: "curated",
    note: "Launched as ZKLSOL (later pivoted to Zinc). Raised 19–24 October 2025, predating the current launchpad program.",
    sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "PAYS", amountUsd: 750_000, goalUsd: 550_000, committedUsd: 6_149_247,
    price: 0.075, fdvUsd: 1_856_250, contributors: 1_837, closed: "2025-10-27",
    track: "curated", sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "SOLO", amountUsd: 8_000_000, goalUsd: 2_000_000, committedUsd: 102_932_673,
    price: 0.80, fdvUsd: 20_640_000, contributors: 6_604, closed: "2025-11-18",
    track: "curated", sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "RNGR", amountUsd: 6_000_000, goalUsd: 6_000_000, committedUsd: 86_398_012,
    price: 0.60, fdvUsd: 15_375_000, contributors: 8_761, closed: "2026-01-10",
    track: "curated",
    note: "The largest book on the platform — $86.4M committed from 8,761 contributors. The launch record's $8M is the cap; the settled sale was ~10M tokens (39.02% of the 25.625M supply) at $0.60, i.e. ~$6M. First MetaDAO raise to include existing investors (backed by RockawayX): 4.36M tokens vest linearly over 24 months alongside a 7.6M team performance package and 768,750 for ambassadors.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "OMFG", committedUsd: 1_118_102, goalUsd: 300_000,
    price: 0.112, fdvUsd: 7_520_000, contributors: 321, closed: "2025-07-28",
    track: "curated", amountUnknown: true,
    note: "Raise closed July 2025; futarchy-AMM trading only began February 2026. The v0.5 launch record does not publish a settled amount, so only commitments are shown.",
    sourceUrl: ARCHIVE_INDEX,
  },
  {
    symbol: "P2P", amountUsd: 6_000_000, goalUsd: 6_000_000, committedUsd: 7_155_515,
    price: 0.60, fdvUsd: 15_480_000, contributors: 759, closed: "2026-04-01",
    track: "curated",
    note: "Closed at 119% of its minimum. Press reports of a $5.2M shortfall conflict with the on-chain record and the launch's own Complete status.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "CRED", amountUsd: 4_000_000, goalUsd: 2_000_000, committedUsd: 32_775_016,
    price: 0.40, fdvUsd: 9_065_000, contributors: 790, closed: "2026-07-17",
    track: "curated",
    note: "8.2× oversubscribed against a $4M cap; roughly $28.7M was refunded in USDC at TGE.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "LASO", goalUsd: 750_000, committedUsd: 25_637_316, contributors: 715,
    fdvUsd: 3_000_000, price: 0.1, closed: "2026-07-04",
    track: "curated", amountUnknown: true,
    note: "Blind-cap raise at a fixed $3M FDV regardless of amount raised, on a 30M-token supply — an exception to the standard 10M-token sale. 34× oversubscribed. The settled amount is not recorded on-chain, so it is left blank rather than estimated. The price is not estimated either: a fixed $3M FDV over the 29,999,942 tokens the chain reports fixes it at $0.10, which is why this row carries a price but no amount — the blind cap is exactly what severs the two.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "CARS", amountUsd: 250_000, goalUsd: 250_000, committedUsd: 31_968_872,
    price: 0.025, fdvUsd: 645_000, contributors: 723, closed: "2026-07-25",
    track: "curated",
    note: "128× oversubscribed — $31.97M committed against a $250K minimum. Aggregator figures near $18.9M mislabel partial commitments as the amount raised; the settled figure is $250K (10M tokens × $0.025, consistent with the $645K FDV).",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "HURU", amountUsd: 0, goalUsd: 3_000_000, committedUsd: 2_003_593,
    fdvUsd: 7_600_000, contributors: 332, closed: "2026-02-07",
    track: "curated", failed: true, price: 0.30,
    note: "MetaDAO's only outright failure — reached 67% of its $3M minimum, so the launch entered Refunding and every contribution was returned. It was the first uncapped sale, which removed the oversubscription scarcity of earlier raises, and the book was dangerously concentrated: the top wallet alone was 54.9% of the raise and the top five about 83%, across just 332 contributors (Ranger had 8,761).",
    sourceUrl: ONCHAIN,
  },

  // --- Permissionless track (futard.io, "Powered by MetaDAO"). Same protocol,
  // no curation: minimums are tiny and oversubscription is extreme.
  {
    symbol: "RAWR", amountUsd: 200_000, goalUsd: 200_000, committedUsd: 15_287_173,
    price: 0.02, fdvUsd: 516_000, contributors: 906, closed: "2026-05-15",
    track: "permissionless",
    note: "76× oversubscribed. The settled amount is not stored on-chain; pro-rata settlement implies the $200K minimum was deployed.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "FUTARDIO", amountUsd: 50_000, goalUsd: 50_000, committedUsd: 11_402_898,
    fdvUsd: 90_000, contributors: 725, closed: "2026-03-04",
    track: "permissionless",
    note: "228x oversubscribed on a one-day window — the most extreme ratio on the platform.",
    sourceUrl: FUTARD_ARCHIVE,
  },
  {
    symbol: "SUPER", amountUsd: 50_000, goalUsd: 50_000, committedUsd: 5_950_859,
    fdvUsd: 75_000, contributors: 290, closed: "2026-03-05",
    track: "permissionless", sourceUrl: FUTARD_ARCHIVE,
  },
  {
    symbol: "GSIM", amountUsd: 28_000, goalUsd: 28_000, committedUsd: 200_500,
    price: 0.0028, fdvUsd: 72_240, contributors: 47, closed: "2026-06-09",
    track: "permissionless",
    note: "Use of funds disclosed: $22.4K operating (~4.2 months of runway) and $5.6K liquidity.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "ARL", amountUsd: 10_000, goalUsd: 10_000, committedUsd: 10_010,
    price: 0.001, fdvUsd: 25_800, contributors: 1, closed: "2026-06-24",
    track: "permissionless",
    note: "Areal attempted six raises; five failed to reach their minimum and refunded. This sixth attempt cleared a $10K minimum in a 60-minute window with a single funder.",
    sourceUrl: ONCHAIN,
  },
  {
    symbol: "ORDR", amountUsd: 150_000, goalUsd: 150_000, committedUsd: 9_286_571,
    price: 0.015, fdvUsd: 387_000, contributors: 293, closed: "2026-07-31",
    track: "permissionless",
    note: "62× oversubscribed — $9.29M committed against a $150K cap, so 98.4% was refunded. The launch page's own meta description reads \"$9.3M raised\", which is the committed figure; the settled raise was $150,000.",
    sourceUrl: `${FUTARD_LAUNCH}HwvxqXHcRNKikH8RsqRRaV6NCpzxg1g5tHgnMfsdaaEj`,
  },
  {
    symbol: "KIMIA", amountUsd: 60_000, goalUsd: 60_000, committedUsd: 727_114,
    price: 0.006, fdvUsd: 154_800, contributors: 58, closed: "2026-08-05",
    track: "permissionless",
    note: "12× oversubscribed. CryptoRank reports $672,114 for this raise, which matches neither the committed nor the settled figure; the launch record is authoritative.",
    sourceUrl: `${FUTARD_LAUNCH}FwCDgK9C8mjWr7wULPFzEv4QBt6koTnMQrKTC45TxWAk`,
  },
  {
    symbol: "BASKET", amountUsd: 10_000, goalUsd: 10_000, committedUsd: 17_509,
    price: 0.001, fdvUsd: 25_800, contributors: 29, closed: "2026-08-05",
    track: "permissionless",
    note: "The least oversubscribed launch on the platform at 1.75×, so only 42.9% was refunded — against 98%+ on most permissionless raises.",
    sourceUrl: `${FUTARD_LAUNCH}AtBwB8fYsxLLSt3mwK9Ma4joCpG9yuPzxBEcSsEaiSAT`,
  },
  {
    symbol: "FAF", noRaise: true,
    note: "Flash.Trade never ran an ICO. The team self-funded through 15 months of development and distributed 80% of supply to the community via a burn-to-claim airdrop to Flash Beast NFT holders. It appears here because it adopted MetaDAO futarchy governance and trades on the AMM — that is secondary trading, not a raise.",
    sourceUrl: "https://solanafloor.com/news/flash-trade-faf-token-launch",
  },
  {
    symbol: "META", amountUsd: 2_229_950, price: 0.5574875, fdvUsd: 11_600_000,
    contributors: 31, closed: "2024-08-01",
    // $2,229,950 bought exactly 4,000 pre-split META — 3,035 to Paradigm
    // (14.6% of supply) and 965 across ~30 angels, per CoinDesk's announcement.
    // The 1:1000 split (metadao.fi/migration) makes that 4,000,000 tokens in
    // today's units, so the price is $2,229,950 ÷ 4,000,000 — held in the
    // registry rather than derived at runtime because the 10M-token launchpad
    // rule does not apply to a private round, and its tooltip would misstate
    // where this number comes from. Aggregators list the round price as
    // undisclosed; the token counts in the primary source pin it down.
    // The valuation follows the same way: 3,035 ÷ 14.6% ≈ 20,788 pre-split
    // tokens in existence, × $557.49 ≈ $11.6M — rounded to match the
    // percentage's own precision. Contributors is Paradigm plus the article's
    // "around 30" angels, so it carries that same softness. No committedUsd on
    // purpose: a private round has no commitment book, so demand and
    // oversubscription do not exist for it, undisclosed or otherwise.
    note: "Not a launchpad ICO — a $2.23M round led by Paradigm (3,035 of 4,000 pre-split tokens; ~30 angels took the rest) at ~$11.6M implied valuation, $12.1M total across all rounds. Price is in post-split units: $557.49 a token then, ÷1000 for today's META.",
    sourceUrl: "https://www.coindesk.com/tech/2024/08/01/crypto-vc-paradigm-invests-in-metadao-as-prediction-markets-boom",
  },
];

const bySymbol = new Map(RAISES.map((r) => [r.symbol.toUpperCase(), r]));

export function raiseFor(symbol: string | null | undefined): RaiseRecord | undefined {
  if (!symbol) return undefined;
  const r = bySymbol.get(symbol.toUpperCase());
  if (!r) return undefined;
  // The curated sale is a fixed 10M-token bucket at a uniform price, so the
  // accepted raise and the per-token price imply each other. This only holds
  // for the curated track — permissionless launches size their own supply, and
  // LASO used a blind cap at fixed FDV.
  const derivable =
    r.track === "curated" && r.symbol !== "LASO" && !r.noRaise && !r.amountUnknown && !r.failed;
  if (!derivable) return r;
  if (r.amountUsd == null && r.price != null) {
    return { ...r, amountUsd: r.price * ICO_TOKENS_SOLD };
  }
  if (r.price == null && r.amountUsd != null && r.amountUsd > 0) {
    return { ...r, price: r.amountUsd / ICO_TOKENS_SOLD };
  }
  return r;
}

/**
 * Refund rate: MetaDAO raises accept a fraction of what is committed and
 * refund the rest. Only computable when both figures are known.
 */
export function refundRate(r: RaiseRecord): number | null {
  if (r.amountUnknown || r.noRaise) return null;
  if (r.committedUsd == null || r.amountUsd == null || r.committedUsd <= 0) return null;
  // A failed raise refunds everything, including commitments above the minimum.
  const kept = Math.min(r.amountUsd, r.committedUsd);
  return (1 - kept / r.committedUsd) * 100;
}
