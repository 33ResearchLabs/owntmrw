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

/** Resolve the owner wallet of a token account. */
export async function tokenAccountOwner(tokenAccount: string): Promise<string | null> {
  const r = await rpc<{ value?: { data?: { parsed?: { info?: { owner?: string } } } } }>(
    "getAccountInfo", [tokenAccount, { encoding: "jsonParsed" }]
  );
  return r?.value?.data?.parsed?.info?.owner ?? null;
}
