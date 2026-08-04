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

/** Resolve the owner wallet of a token account. */
export async function tokenAccountOwner(tokenAccount: string): Promise<string | null> {
  const r = await rpc<{ value?: { data?: { parsed?: { info?: { owner?: string } } } } }>(
    "getAccountInfo", [tokenAccount, { encoding: "jsonParsed" }]
  );
  return r?.value?.data?.parsed?.info?.owner ?? null;
}
