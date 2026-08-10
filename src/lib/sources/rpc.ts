import { postJSON, sleep } from "./http";

const RPC = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

interface RpcResp<T> { result?: T; error?: { message: string } }

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  const res = await postJSON<RpcResp<T>>(RPC, { jsonrpc: "2.0", id: 1, method, params });
  await sleep(400); // be polite to the public endpoint
  return res?.result ?? null;
}

export async function tokenSupply(mint: string): Promise<number | null> {
  const r = await rpc<{ value?: { uiAmount?: number } }>("getTokenSupply", [mint]);
  return r?.value?.uiAmount ?? null;
}

export interface LargestAccount { address: string; uiAmount: number }

export async function largestTokenAccounts(mint: string): Promise<LargestAccount[]> {
  const r = await rpc<{ value?: { address: string; uiAmount: number | null }[] }>(
    "getTokenLargestAccounts", [mint]
  );
  return (r?.value ?? []).map((v) => ({ address: v.address, uiAmount: v.uiAmount ?? 0 }));
}

export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/**
 * USDC held by a DAO vault, read straight from its token accounts.
 *
 * MetaDAO's tickers feed carries `treasury_usdc_aum`, but only for the tokens
 * it lists — Ranger and ZKLSOL are absent from it, so their treasuries showed
 * as unknown when both are verifiably empty. Reading the vault directly
 * settles it, and agrees with the feed to the cent where both exist (ORDR:
 * $105,000 either way), so the two are interchangeable rather than rival
 * figures.
 *
 * Returns null only when the vault cannot be read. A wallet holding no USDC
 * has no token account at all, which is a real zero and reported as one —
 * the same distinction the tickers feed needs for FAF.
 */
export async function usdcBalance(owner: string): Promise<number | null> {
  const r = await rpc<{ value?: { account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } } }[] }>(
    "getTokenAccountsByOwner", [owner, { mint: USDC_MINT }, { encoding: "jsonParsed" }]
  );
  if (!r?.value) return null;
  return r.value.reduce(
    (sum, a) => sum + (a.account.data.parsed.info.tokenAmount.uiAmount ?? 0),
    0
  );
}

/** Original SPL Token, then Token-2022. A mint under either is a real balance. */
const TOKEN_PROGRAMS = [
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

export interface OwnerBalances {
  /** SOL, in SOL rather than lamports. Null when the read failed. */
  sol: number | null;
  /** USDC. Null when the read failed; 0 is a real, held zero. */
  usdc: number | null;
  /** Every non-zero SPL balance as mint → amount. Null when the read failed. */
  tokens: Record<string, number> | null;
}

/**
 * Everything the portfolio needs about one wallet, in one pass.
 *
 * Two token-account calls rather than one per mint: asking by `programId`
 * returns the whole account list at once, so checking a wallet against twenty
 * mints costs the same as checking it against one. Both programs, because a
 * mint issued under Token-2022 is invisible to a query for the original and
 * would read as a zero balance.
 *
 * Null and zero are kept apart throughout. A failed call means "not known" and
 * must not render as an empty wallet — the distinction the rest of this file
 * already makes for treasuries, applied to the reader's own balances.
 */
export async function ownerBalances(owner: string): Promise<OwnerBalances> {
  type Accounts = {
    value?: {
      account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number | null } } } } };
    }[];
  };

  const [lamports, ...programs] = await Promise.all([
    rpc<{ value: number }>("getBalance", [owner]),
    ...TOKEN_PROGRAMS.map((programId) =>
      rpc<Accounts>("getTokenAccountsByOwner", [owner, { programId }, { encoding: "jsonParsed" }])
    ),
  ]);

  // Every program call failing is a failed read, not an empty wallet.
  const tokens = programs.every((r) => r == null)
    ? null
    : programs.reduce<Record<string, number>>((acc, r) => {
        for (const a of r?.value ?? []) {
          const { mint, tokenAmount } = a.account.data.parsed.info;
          const amt = tokenAmount.uiAmount ?? 0;
          if (amt > 0) acc[mint] = (acc[mint] ?? 0) + amt;
        }
        return acc;
      }, {});

  return {
    sol: lamports ? lamports.value / 1e9 : null,
    // USDC comes out of the same scan rather than its own call — the account
    // is already in the list, and a second request would be the same answer.
    usdc: tokens ? tokens[USDC_MINT] ?? 0 : null,
    tokens,
  };
}

/** Resolve the owner wallet of a token account. */
export async function tokenAccountOwner(tokenAccount: string): Promise<string | null> {
  const r = await rpc<{ value?: { data?: { parsed?: { info?: { owner?: string } } } } }>(
    "getAccountInfo", [tokenAccount, { encoding: "jsonParsed" }]
  );
  return r?.value?.data?.parsed?.info?.owner ?? null;
}
