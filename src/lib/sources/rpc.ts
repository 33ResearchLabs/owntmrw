import { useWallet } from "@/components/wallet";
import { postJSON, sleep } from "./http";

/**
 * ============================================================
 * SOLANA DEVNET
 * ============================================================
 */

const RPC = process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

/**
 * Devnet USDT mint.
 *
 * .env.local:
 *
 * SOLANA_USDT_MINT=YOUR_DEVNET_USDT_MINT
 */
export const USDT_MINT = process.env.SOLANA_USDT_MINT || "";

console.log("[SOLANA] RPC:", RPC);
console.log("[SOLANA] USDT MINT:", USDT_MINT || "NOT SET");

/**
 * ============================================================
 * RPC TYPES
 * ============================================================
 */

interface RpcResp<T> {
  jsonrpc?: string;
  id?: number | string;

  result?: T;

  error?: {
    code?: number;
    message: string;
    data?: unknown;
  };
}

/**
 * ============================================================
 * GENERIC RPC
 * ============================================================
 */

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    console.log("[SOLANA RPC REQUEST]", {
      method,
      params,
    });

    const response = await postJSON<RpcResp<T>>(RPC, {
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    });

    console.log("[SOLANA RPC RESPONSE]", {
      method,
      response,
    });

    if (!response) {
      console.error("[SOLANA RPC] Empty response");

      return null;
    }

    if (response.error) {
      console.error("[SOLANA RPC] Error:", response.error);

      return null;
    }

    await sleep(400);

    return response.result ?? null;
  } catch (error) {
    console.error("[SOLANA RPC] Request failed:", {
      method,
      error,
    });

    return null;
  }
}

/**
 * ============================================================
 * TOKEN SUPPLY
 * ============================================================
 */

export async function tokenSupply(mint: string): Promise<number | null> {
  const response = await rpc<{
    value?: {
      uiAmount?: number | null;
    };
  }>("getTokenSupply", [mint]);

  return response?.value?.uiAmount ?? null;
}

/**
 * ============================================================
 * USDC BALANCE
 * ============================================================
 *
 * Reads the USDC balance of a wallet.
 *
 * USDC mint:
 * Mainnet:
 *   EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
 *
 * Your existing app uses SOLANA_RPC_URL, so this works with
 * the configured RPC endpoint.
 */

const USDC_MINT =
  process.env.SOLANA_USDC_MINT ||
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

export async function usdcBalance(owner: string): Promise<number | null> {
  type TokenAccount = {
    account: {
      data: {
        parsed: {
          info: {
            mint: string;
            tokenAmount: {
              uiAmount: number | null;
            };
          };
        };
      };
    };
  };

  type Response = {
    value?: TokenAccount[];
  };

  const response = await rpc<Response>("getTokenAccountsByOwner", [
    owner,
    {
      mint: USDC_MINT,
    },
    {
      encoding: "jsonParsed",
    },
  ]);

  if (response === null) {
    return null;
  }

  let balance = 0;

  for (const account of response.value ?? []) {
    const amount = account.account.data.parsed.info.tokenAmount.uiAmount;

    if (amount != null) {
      balance += amount;
    }
  }

  return balance;
}
/**
 * ============================================================
 * LARGEST TOKEN ACCOUNTS
 * ============================================================
 */

export interface LargestAccount {
  address: string;
  uiAmount: number;
}

export async function largestTokenAccounts(
  mint: string,
): Promise<LargestAccount[]> {
  const response = await rpc<{
    value?: {
      address: string;
      uiAmount: number | null;
    }[];
  }>("getTokenLargestAccounts", [mint]);

  return (response?.value ?? []).map((account) => ({
    address: account.address,
    uiAmount: account.uiAmount ?? 0,
  }));
}

/**
 * ============================================================
 * TOKEN PROGRAMS
 * ============================================================
 */

const TOKEN_PROGRAMS = [
  /**
   * Original SPL Token program
   */
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",

  /**
   * Token-2022 program
   */
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
];

/**
 * ============================================================
 * OWNER BALANCES
 * ============================================================
 */

export interface OwnerBalances {
  /**
   * Native SOL balance.
   */
  sol: number | null;

  /**
   * Devnet USDT balance.
   */
  usdt: number | null;

  /**
   * All non-zero SPL tokens.
   *
   * mint -> balance
   */
  tokens: Record<string, number> | null;
}

/**
 * ============================================================
 * OWNER BALANCES
 * ============================================================
 */

export async function ownerBalances(owner: string): Promise<OwnerBalances> {
  type TokenAccount = {
    account: {
      data: {
        parsed: {
          info: {
            mint: string;

            tokenAmount: {
              uiAmount: number | null;

              uiAmountString?: string;
            };
          };
        };
      };
    };
  };

  type AccountsResponse = {
    value?: TokenAccount[];
  };

  console.log("==============================================");

  console.log("[OWNER BALANCES]", owner);

  console.log("[OWNER BALANCES] RPC:", RPC);

  console.log("[OWNER BALANCES] USDT MINT:", USDT_MINT || "NOT SET");

  console.log("==============================================");

  /**
   * ==========================================================
   * SOL
   * ==========================================================
   */

  const lamports = await rpc<{
    value: number;
  }>("getBalance", [owner]);

  const sol = lamports !== null ? lamports.value / 1_000_000_000 : null;

  console.log("[OWNER BALANCES] SOL:", sol);

  /**
   * ==========================================================
   * TOKEN ACCOUNTS
   * ==========================================================
   */

  const programResults: (AccountsResponse | null)[] = [];

  for (const programId of TOKEN_PROGRAMS) {
    console.log("[OWNER BALANCES] Reading token program:", programId);

    const response = await rpc<AccountsResponse>("getTokenAccountsByOwner", [
      owner,
      {
        programId,
      },
      {
        encoding: "jsonParsed",
      },
    ]);

    programResults.push(response);

    console.log("[OWNER BALANCES] Token program result:", {
      programId,
      accounts: response?.value?.length ?? 0,
      failed: response === null,
    });
  }

  /**
   * ==========================================================
   * TOKEN BALANCES
   * ==========================================================
   */

  const allProgramsFailed = programResults.every(
    (response) => response === null,
  );

  let tokens: Record<string, number> | null;

  if (allProgramsFailed) {
    console.error("[OWNER BALANCES] ALL TOKEN PROGRAM RPC CALLS FAILED");

    tokens = null;
  } else {
    tokens = {};

    for (const response of programResults) {
      if (!response?.value) {
        continue;
      }

      for (const account of response.value) {
        const { mint, tokenAmount } = account.account.data.parsed.info;

        const amount = tokenAmount.uiAmount ?? 0;

        if (amount <= 0) {
          continue;
        }

        tokens[mint] = (tokens[mint] ?? 0) + amount;
      }
    }
  }

  /**
   * ==========================================================
   * USDT
   * ==========================================================
   */

  const usdt =
    tokens === null ? null : USDT_MINT ? (tokens[USDT_MINT] ?? 0) : 0;

  /**
   * ==========================================================
   * DEBUG
   * ==========================================================
   */

  console.log(
    "[PORTFOLIO DEBUG] TOKEN MINTS:",
    tokens ? Object.keys(tokens) : null,
  );

  console.log("[PORTFOLIO DEBUG] TOKEN BALANCES:", tokens);

  console.log("[PORTFOLIO DEBUG] USDT:", usdt);

  /**
   * ==========================================================
   * FINAL RESULT
   * ==========================================================
   */

  const result: OwnerBalances = {
    sol,
    usdt,
    tokens,
  };

  console.log("[OWNER BALANCES] FINAL RESULT:", result);

  return result;
}

/**
 * ============================================================
 * TOKEN ACCOUNT OWNER
 * ============================================================
 */

export async function tokenAccountOwner(
  tokenAccount: string,
): Promise<string | null> {
  const response = await rpc<{
    value?: {
      data?: {
        parsed?: {
          info?: {
            owner?: string;
          };
        };
      };
    };
  }>("getAccountInfo", [
    tokenAccount,
    {
      encoding: "jsonParsed",
    },
  ]);

  return response?.value?.data?.parsed?.info?.owner ?? null;
}
