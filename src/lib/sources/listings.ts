import { Connection, PublicKey } from "@solana/web3.js";
import { bestPairForMint } from "./dexscreener";
import { tokenReport } from "./rugcheck";

/**
 * Everything the server can learn about a mint someone wants listed, read
 * once at submit time and frozen into the request for the reviewer.
 *
 * Runs against mainnet by default regardless of `SOLANA_RPC_URL`: that
 * variable points the invest sandbox at devnet, but a listing is a claim
 * about a token people can actually buy, and the market and holder data the
 * profile is built from only exist on mainnet. `LISTINGS_RPC_URL` overrides
 * it so the flow can be exercised end to end against devnet mints.
 */
const RPC_URL =
  process.env.LISTINGS_RPC_URL ||
  process.env.SOLANA_MAINNET_RPC_URL ||
  "https://api.mainnet-beta.solana.com";

/** Whether the verifier is pointed somewhere other than mainnet. */
export const LISTINGS_CLUSTER = RPC_URL.includes("devnet")
  ? "devnet"
  : RPC_URL.includes("testnet")
    ? "testnet"
    : "mainnet";

const connection = new Connection(RPC_URL, "confirmed");

const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";
const METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s",
);

export interface MintInfo {
  program: "token" | "token-2022";
  decimals: number;
  /** Whole tokens, decimals applied. */
  supply: number;
  mintAuthority: string | null;
  freezeAuthority: string | null;
}

export interface TokenMetadata {
  updateAuthority: string;
  name: string;
  symbol: string;
  uri: string;
  /** `image` from the off-chain JSON the URI points at, when it resolved. */
  image: string | null;
}

export interface MarketInfo {
  pairAddress: string;
  dex: string;
  quoteSymbol: string;
  priceUsd: number | null;
  liquidityUsd: number | null;
  vol24h: number | null;
  fdv: number | null;
  createdTs: number | null;
  image: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
}

export interface RiskInfo {
  /**
   * RugCheck's normalised 0–100 score, shown as-is. Whether higher means
   * safer is not settled in this codebase (db.ts says so; BONK reads 7), so
   * nothing here thresholds it — `rugged` and danger-level flags carry the
   * warning instead.
   */
  score: number | null;
  rugged: boolean;
  risks: { name: string; level: string }[];
  top10Pct: number | null;
  holders: number | null;
}

export type Ownership = "mint_authority" | "update_authority" | "unverified";

export interface ListingVerification {
  cluster: typeof LISTINGS_CLUSTER;
  checkedTs: number;
  mint: MintInfo;
  metadata: TokenMetadata | null;
  market: MarketInfo | null;
  risk: RiskInfo | null;
  /**
   * Whether the submitted website mentions the mint. A soft signal for the
   * reviewer: null when there was no website or it could not be fetched.
   */
  websiteNamesMint: boolean | null;
}

export type InspectResult =
  | { ok: true; mint: MintInfo; metadata: TokenMetadata | null }
  | { ok: false; reason: string };

/**
 * The cheap first step: is this an SPL mint at all, and what does it call
 * itself. Used both to pre-fill the form and as the opening of `verify`.
 */
export async function inspectMint(mint: string): Promise<InspectResult> {
  let key: PublicKey;
  try {
    key = new PublicKey(mint);
  } catch {
    return { ok: false, reason: "Not a valid Solana address." };
  }

  const acct = await connection.getParsedAccountInfo(key).catch(() => null);
  const value = acct?.value;
  if (!value) {
    return {
      ok: false,
      reason: `No account at this address on ${LISTINGS_CLUSTER}.`,
    };
  }
  const owner = value.owner.toBase58();
  const program =
    owner === TOKEN_PROGRAM
      ? "token"
      : owner === TOKEN_2022_PROGRAM
        ? "token-2022"
        : null;
  const parsed = "parsed" in value.data ? value.data.parsed : null;
  if (!program || !parsed || parsed.type !== "mint") {
    return {
      ok: false,
      reason: "This address is not a token mint. Paste the mint, not a wallet or a pool.",
    };
  }
  const info = parsed.info as {
    decimals: number;
    supply: string;
    mintAuthority: string | null;
    freezeAuthority: string | null;
  };
  const decimals = Number(info.decimals ?? 0);
  const mintInfo: MintInfo = {
    program,
    decimals,
    supply: Number(info.supply ?? 0) / 10 ** decimals,
    mintAuthority: info.mintAuthority ?? null,
    freezeAuthority: info.freezeAuthority ?? null,
  };

  const metadata = await readMetadata(key).catch(() => null);
  return { ok: true, mint: mintInfo, metadata };
}

/**
 * Metaplex token metadata, decoded by hand — the layout is stable and
 * pulling in the SDK for three strings is not worth the dependency.
 *
 *   0      key (u8)
 *   1..33  update authority
 *   33..65 mint
 *   65..   borsh strings: name, symbol, uri — each a u32 length followed by
 *          that many bytes, padded on-chain with NULs that must be stripped.
 */
async function readMetadata(mint: PublicKey): Promise<TokenMetadata | null> {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from("metadata"), METADATA_PROGRAM.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM,
  );
  const acct = await connection.getAccountInfo(pda);
  if (!acct) return null;
  const buf = acct.data;
  if (buf.length < 65) return null;

  const updateAuthority = new PublicKey(buf.subarray(1, 33)).toBase58();
  let off = 65;
  const str = () => {
    const len = buf.readUInt32LE(off);
    off += 4;
    const s = buf.subarray(off, off + len).toString("utf8").replace(/\0+$/g, "");
    off += len;
    return s.trim();
  };
  const name = str();
  const symbol = str();
  const uri = str();

  return {
    updateAuthority,
    name,
    symbol,
    uri,
    image: uri ? await imageFromUri(uri) : null,
  };
}

/** Pull `image` out of the off-chain metadata JSON, tolerating IPFS URIs. */
async function imageFromUri(uri: string): Promise<string | null> {
  const url = httpUrl(uri);
  if (!url) return null;
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 200_000) return null;
    const json = JSON.parse(text) as { image?: unknown };
    return typeof json.image === "string" ? httpUrl(json.image) : null;
  } catch {
    return null;
  }
}

function httpUrl(u: string): string | null {
  if (u.startsWith("ipfs://")) return `https://ipfs.io/ipfs/${u.slice(7)}`;
  if (u.startsWith("ar://")) return `https://arweave.net/${u.slice(5)}`;
  return /^https?:\/\//.test(u) ? u : null;
}

/**
 * Who the submitter is to this token. Mint authority or metadata update
 * authority is proof; a freeze authority alone is not, and launchpad tokens
 * commonly have both renounced or held by a program — those come through as
 * unverified and must carry a public proof link instead.
 */
export function ownershipOf(
  wallet: string,
  mint: MintInfo,
  metadata: TokenMetadata | null,
): Ownership {
  if (mint.mintAuthority === wallet) return "mint_authority";
  if (metadata?.updateAuthority === wallet) return "update_authority";
  return "unverified";
}

/** Fetch the site and look for the mint in its HTML. Soft signal only. */
async function websiteMentions(
  website: string | null,
  mint: string,
): Promise<boolean | null> {
  if (!website) return null;
  try {
    const res = await fetch(website, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "text/html" },
      redirect: "follow",
    });
    if (!res.ok) return null;
    const html = (await res.text()).slice(0, 2_000_000);
    return html.includes(mint);
  } catch {
    return null;
  }
}

/**
 * The full report. Only the mint read can fail; market, risk and the website
 * check are best-effort and come back null rather than blocking a submission
 * — a token with no pool yet is a legitimate `unlaunched` listing.
 */
export async function verifyListing(
  mint: string,
  website: string | null,
): Promise<
  | { ok: true; report: ListingVerification }
  | { ok: false; reason: string }
> {
  const inspected = await inspectMint(mint);
  if (!inspected.ok) return inspected;

  const [pair, rug, websiteNamesMint] = await Promise.all([
    LISTINGS_CLUSTER === "mainnet" ? bestPairForMint(mint) : Promise.resolve(null),
    LISTINGS_CLUSTER === "mainnet" ? tokenReport(mint) : Promise.resolve(null),
    websiteMentions(website, mint),
  ]);

  const market: MarketInfo | null = pair
    ? {
        pairAddress: pair.pairAddress,
        dex: pair.dexId,
        quoteSymbol: pair.quoteToken.symbol,
        priceUsd: pair.priceUsd != null ? Number(pair.priceUsd) : null,
        liquidityUsd: pair.liquidity?.usd ?? null,
        vol24h: pair.volume?.h24 ?? null,
        fdv: pair.fdv ?? null,
        createdTs: pair.pairCreatedAt ? Math.floor(pair.pairCreatedAt / 1000) : null,
        image: pair.info?.imageUrl ?? null,
        website: pair.info?.websites?.[0]?.url ?? null,
        twitter: pair.info?.socials?.find((s) => s.type === "twitter")?.url ?? null,
        telegram: pair.info?.socials?.find((s) => s.type === "telegram")?.url ?? null,
        discord: pair.info?.socials?.find((s) => s.type === "discord")?.url ?? null,
      }
    : null;

  const risk: RiskInfo | null = rug
    ? {
        score: rug.scoreNormalised,
        rugged: rug.rugged,
        risks: rug.risks.map((r) => ({ name: r.name, level: r.level })),
        top10Pct: rug.top10Pct,
        holders: rug.totalHolders,
      }
    : null;

  return {
    ok: true,
    report: {
      cluster: LISTINGS_CLUSTER,
      checkedTs: Math.floor(Date.now() / 1000),
      mint: inspected.mint,
      metadata: inspected.metadata,
      market,
      risk,
      websiteNamesMint,
    },
  };
}
