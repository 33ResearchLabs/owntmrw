import {
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getMint,
  getAccount,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import { PublicKey, Transaction } from "@solana/web3.js";

import {
  assertDevnet,
  connection,
  publicKey,
  recentBlockhash,
  serializeTransaction,
} from "./solana";

/**
 * ============================================================
 * INVESTMENT TRANSACTION
 * ============================================================
 *
 * Server-side transaction builder.
 *
 * IMPORTANT:
 *
 * 1. Do NOT use React hooks in this file.
 * 2. `owner` comes from the connected wallet.
 * 3. `vaultAddress` is intentionally derived from `input.owner`
 *    according to the current Devnet testing requirement.
 * 4. The trusted payment mint comes from SOLANA_USDT_MINT.
 * 5. MAX-USDT logic only compares token accounts belonging
 *    to the trusted payment mint.
 *
 * IMPORTANT:
 *
 * Since vaultAddress === owner in this version, the destination
 * wallet is the same wallet that is sending the USDT.
 *
 * This is NOT a real investment vault.
 *
 * It is useful only for testing transaction construction.
 */

/**
 * ============================================================
 * TOKEN PROGRAMS
 * ============================================================
 */

/**
 * Classic SPL Token program.
 */
const SPL_TOKEN_PROGRAM_ID = TOKEN_PROGRAM_ID;

/**
 * Token-2022 program.
 */
const TOKEN_2022_PROGRAM_ID = new PublicKey(
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
);

/**
 * Supported token programs.
 */
const TOKEN_PROGRAMS = [SPL_TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID] as const;

/**
 * ============================================================
 * TYPES
 * ============================================================
 */

export interface InvestmentRequest {
  /**
   * Connected user's wallet address.
   */
  owner: string;

  /**
   * Project token mint.
   *
   * This is only used as the project/investment identifier.
   */
  tokenMint: string;

  /**
   * Amount of USDT to transfer.
   */
  amountUsdt: number;

  /**
   * Optional slippage.
   */
  slippageBps?: number;
}

/**
 * Optional trusted configuration.
 *
 * We intentionally DO NOT have vaultAddress here.
 *
 * Vault is derived from input.owner.
 */
export interface InvestmentBuildOptions {
  /**
   * Optional trusted payment mint override.
   *
   * Normally this comes from SOLANA_USDT_MINT.
   */
  paymentMint?: string;
}

/**
 * ============================================================
 * SERVER CONFIG
 * ============================================================
 */

/**
 * Read a required server-side configuration value.
 */
function requiredServerConfig(value: string | undefined, name: string): string {
  if (!value?.trim()) {
    throw new Error(`${name} is not configured on the server.`);
  }

  return value.trim();
}

/**
 * Get trusted payment-token configuration.
 *
 * We still keep the USDT mint server-side because the browser
 * must NOT be allowed to choose an arbitrary token and call it
 * USDT.
 */
async function getPaymentMintAddress(owner: PublicKey): Promise<string> {
  const accounts = await getWalletTokenAccounts(owner);

  if (accounts.length === 0) {
    throw new Error("No token accounts found in the connected wallet.");
  }

  /**
   * Find the token account with the largest balance.
   *
   * IMPORTANT:
   * This assumes the largest token in this Devnet wallet
   * is the payment token (USDT).
   */
  const maxTokenAccount = accounts.reduce((largest, current) =>
    current.amountRaw > largest.amountRaw ? current : largest,
  );

  console.log("[INVESTMENT] MAX TOKEN:", {
    tokenAccount: maxTokenAccount.tokenAccount,
    mint: maxTokenAccount.mint,
    balance: maxTokenAccount.amount,
    decimals: maxTokenAccount.decimals,
    programId: maxTokenAccount.programId.toBase58(),
  });

  return maxTokenAccount.mint;
}

/**
 * ============================================================
 * TRANSACTION RESULT
 * ============================================================
 */

export interface InvestmentTransaction {
  transaction: string;

  blockhash: string;

  lastValidBlockHeight: number;

  amountUsdt: number;

  tokenMint: string;

  /**
   * Trusted payment mint used for the transfer.
   */
  paymentMint: string;

  /**
   * Token program used by the payment token.
   */
  paymentTokenProgram: string;

  /**
   * User's MAX-USDT token account.
   */
  sourceTokenAccount: string;

  /**
   * Destination token account.
   *
   * In this version it belongs to input.owner.
   */
  destinationTokenAccount: string;
}

/**
 * ============================================================
 * WALLET TOKEN ACCOUNT
 * ============================================================
 */

interface WalletTokenAccount {
  /**
   * SPL token account address.
   */
  tokenAccount: string;

  /**
   * Token mint.
   */
  mint: string;

  /**
   * Owner of the token account.
   */
  owner: string;

  /**
   * Human-readable token amount.
   */
  amount: number;

  /**
   * Raw token amount.
   */
  amountRaw: bigint;

  /**
   * Token decimals.
   */
  decimals: number;

  /**
   * Token program.
   */
  programId: PublicKey;
}

/**
 * ============================================================
 * TOKEN ACCOUNT DISCOVERY
 * ============================================================
 *
 * Wallet
 *   ↓
 * Token accounts
 *   ↓
 * Mint
 *   ↓
 * Balance
 *
 * We query both:
 *
 * - SPL Token
 * - Token-2022
 */
async function getWalletTokenAccounts(
  owner: PublicKey,
): Promise<WalletTokenAccount[]> {
  const results: WalletTokenAccount[] = [];

  for (const programId of TOKEN_PROGRAMS) {
    try {
      const response = await connection.getParsedTokenAccountsByOwner(owner, {
        programId,
      });

      for (const item of response.value) {
        const parsed = item.account.data.parsed?.info;

        if (!parsed) {
          continue;
        }

        const mint = String(parsed.mint ?? "");

        const tokenOwner = String(parsed.owner ?? "");

        const tokenAmount = parsed.tokenAmount;

        const rawAmountString = String(tokenAmount?.amount ?? "0");

        const amountRaw = BigInt(rawAmountString);

        const amount = Number(tokenAmount?.uiAmount ?? 0);

        const decimals = Number(tokenAmount?.decimals ?? 0);

        if (!mint || amountRaw <= BigInt(0)) {
          continue;
        }

        results.push({
          tokenAccount: item.pubkey.toBase58(),
          mint,
          owner: tokenOwner,
          amount,
          amountRaw,
          decimals,
          programId,
        });
      }
    } catch (error) {
      console.error(
        "[INVESTMENT] Failed to read token program:",
        programId.toBase58(),
        error,
      );
    }
  }

  return results;
}

/**
 * ============================================================
 * FIND MAX USDT TOKEN ACCOUNT
 * ============================================================
 *
 * IMPORTANT:
 *
 * We DO NOT do:
 *
 *   largest token = USDT
 *
 * because the wallet may contain arbitrary tokens.
 *
 * Instead:
 *
 * trusted USDT mint
 *       ↓
 * user's token accounts
 *       ↓
 * matching mint only
 *       ↓
 * largest USDT account
 */
async function findPaymentTokenAccount(
  owner: PublicKey,
  paymentMint: PublicKey,
): Promise<WalletTokenAccount> {
  const accounts = await getWalletTokenAccounts(owner);

  if (accounts.length === 0) {
    throw new Error(
      "Your wallet does not have any supported SPL token accounts on Solana Devnet.",
    );
  }

  const normalizedMint = paymentMint.toBase58();

  /**
   * ==========================================================
   * FILTER ONLY TRUSTED USDT
   * ==========================================================
   */

  const usdtAccounts = accounts.filter(
    (account) => account.mint === normalizedMint,
  );

  if (usdtAccounts.length === 0) {
    throw new Error(
      "Your wallet does not contain the configured Devnet USDT token.",
    );
  }

  /**
   * ==========================================================
   * FIND MAX USDT ACCOUNT
   * ==========================================================
   */

  const maxUsdtAccount = usdtAccounts.reduce((largest, current) =>
    current.amountRaw > largest.amountRaw ? current : largest,
  );

  console.log(
    "[INVESTMENT] USDT ACCOUNTS:",
    usdtAccounts.map((account) => ({
      tokenAccount: account.tokenAccount,
      mint: account.mint,
      balance: account.amount,
      decimals: account.decimals,
      programId: account.programId.toBase58(),
    })),
  );

  console.log("[INVESTMENT] MAX USDT ACCOUNT:", {
    tokenAccount: maxUsdtAccount.tokenAccount,

    mint: maxUsdtAccount.mint,

    balance: maxUsdtAccount.amount,

    decimals: maxUsdtAccount.decimals,

    programId: maxUsdtAccount.programId.toBase58(),
  });

  return maxUsdtAccount;
}

/**
 * ============================================================
 * BUILD INVESTMENT TRANSACTION
 * ============================================================
 */
export async function buildInvestmentTransaction(
  input: InvestmentRequest,
  options?: InvestmentBuildOptions,
): Promise<InvestmentTransaction> {
  /**
   * ==========================================================
   * DEVNET
   * ==========================================================
   */

  assertDevnet();

  console.log("[INVESTMENT] INPUT:", input);

  /**
   * ==========================================================
   * VALIDATE AMOUNT
   * ==========================================================
   */

  if (!Number.isFinite(input.amountUsdt)) {
    throw new Error("Invalid investment amount.");
  }

  if (input.amountUsdt <= 0) {
    throw new Error("Investment amount must be greater than zero.");
  }

  /**
   * ==========================================================
   * VALIDATE OWNER
   * ==========================================================
   */

  if (!input.owner?.trim()) {
    throw new Error("Owner wallet is missing.");
  }

  /**
   * ==========================================================
   * VALIDATE PROJECT TOKEN
   * ==========================================================
   */

  if (!input.tokenMint?.trim()) {
    throw new Error("Project token mint is missing.");
  }

  /**
   * ==========================================================
   * OWNER
   * ==========================================================
   */

  const owner = publicKey(input.owner.trim());

  /**
   * ==========================================================
   * PROJECT TOKEN
   * ==========================================================
   */

  const tokenMint = publicKey(input.tokenMint.trim());

  /**
   * ==========================================================
   * VAULT
   * ==========================================================
   *
   * IMPORTANT:
   *
   * You requested:
   *
   *     vaultAddress = input.owner
   *
   * Therefore the connected wallet is also being used as
   * the destination wallet.
   */

  const vaultAddress = input.owner.trim();

  const vault = publicKey(vaultAddress);

  /**
   * ==========================================================
   * PAYMENT MINT
   * ==========================================================
   *
   * USDT mint remains trusted server-side.
   */

  const paymentMintAddress = await getPaymentMintAddress(owner);

  const paymentMint = publicKey(paymentMintAddress);

  console.log("[INVESTMENT] Owner:", owner.toBase58());

  console.log("[INVESTMENT] Project token:", tokenMint.toBase58());

  console.log("[INVESTMENT] Vault:", vault.toBase58());

  console.log("[INVESTMENT] Payment mint:", paymentMint.toBase58());

  /**
   * ==========================================================
   * FIND MAX USDT TOKEN ACCOUNT
   * ==========================================================
   */

  const paymentTokenAccount = await findPaymentTokenAccount(owner, paymentMint);

  const sourceTokenAccount = publicKey(paymentTokenAccount.tokenAccount);

  console.log(
    "[INVESTMENT] MAX USDT SOURCE ACCOUNT:",
    sourceTokenAccount.toBase58(),
  );

  console.log("[INVESTMENT] MAX USDT BALANCE:", paymentTokenAccount.amount);

  /**
   * ==========================================================
   * VERIFY PAYMENT MINT
   * ==========================================================
   */

  let paymentMintInfo;

  try {
    paymentMintInfo = await getMint(
      connection,
      paymentMint,
      "confirmed",
      paymentTokenAccount.programId,
    );
  } catch {
    throw new Error(
      "The payment token mint could not be found on Solana Devnet.",
    );
  }

  const decimals = paymentMintInfo.decimals;

  /**
   * ==========================================================
   * VERIFY SOURCE TOKEN ACCOUNT
   * ==========================================================
   */

  let sourceAccount;

  try {
    sourceAccount = await getAccount(
      connection,
      sourceTokenAccount,
      "confirmed",
      paymentTokenAccount.programId,
    );
  } catch {
    throw new Error(
      "Your payment token account could not be verified on Solana Devnet.",
    );
  }

  /**
   * ==========================================================
   * VERIFY SOURCE OWNER
   * ==========================================================
   */

  if (!sourceAccount.owner.equals(owner)) {
    throw new Error(
      "The payment token account does not belong to the connected wallet.",
    );
  }

  /**
   * ==========================================================
   * VERIFY SOURCE MINT
   * ==========================================================
   */

  if (!sourceAccount.mint.equals(paymentMint)) {
    throw new Error(
      "The payment token account does not belong to the selected payment mint.",
    );
  }

  /**
   * ==========================================================
   * AMOUNT
   * ==========================================================
   */

  const amountRaw = BigInt(Math.round(input.amountUsdt * 10 ** decimals));

  if (amountRaw <= BigInt(0)) {
    throw new Error("Investment amount is too small.");
  }

  /**
   * ==========================================================
   * CHECK BALANCE
   * ==========================================================
   */

  if (sourceAccount.amount < amountRaw) {
    throw new Error(
      `Insufficient USDT balance. Required: ${input.amountUsdt}, available: ${paymentTokenAccount.amount}.`,
    );
  }

  /**
   * ==========================================================
   * PROJECT TOKEN
   * ==========================================================
   *
   * The project token is only used as an investment
   * identifier.
   *
   * We don't need to transfer the project token.
   */

  console.log("[INVESTMENT] Project token:", tokenMint.toBase58());

  /**
   * ==========================================================
   * DESTINATION TOKEN ACCOUNT
   * ==========================================================
   *
   * Since vault === owner in this requested version,
   * this derives the user's own USDT ATA.
   */

  const destinationAta = await getAssociatedTokenAddress(
    paymentMint,
    vault,
    false,
    paymentTokenAccount.programId,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  console.log(
    "[INVESTMENT] Destination token account:",
    destinationAta.toBase58(),
  );

  /**
   * ==========================================================
   * VERIFY DESTINATION ACCOUNT
   * ==========================================================
   */

  let destinationAccount;

  try {
    destinationAccount = await getAccount(
      connection,
      destinationAta,
      "confirmed",
      paymentTokenAccount.programId,
    );
  } catch {
    throw new Error(
      "Destination wallet does not have a USDT token account on Devnet.",
    );
  }

  /**
   * ==========================================================
   * VERIFY DESTINATION MINT
   * ==========================================================
   */

  if (!destinationAccount.mint.equals(paymentMint)) {
    throw new Error(
      "Destination token account does not match the payment token mint.",
    );
  }

  /**
   * ==========================================================
   * VERIFY DESTINATION OWNER
   * ==========================================================
   */

  if (!destinationAccount.owner.equals(vault)) {
    throw new Error(
      "Destination token account does not belong to the connected wallet.",
    );
  }

  /**
   * ==========================================================
   * BLOCKHASH
   * ==========================================================
   */

  const { blockhash, lastValidBlockHeight } = await recentBlockhash();

  /**
   * ==========================================================
   * TRANSACTION
   * ==========================================================
   */

  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  });

  /**
   * ==========================================================
   * TRANSFER
   * ==========================================================
   *
   * Source:
   *
   *     MAX USDT TOKEN ACCOUNT
   *
   * Destination:
   *
   *     input.owner's USDT TOKEN ACCOUNT
   */

  transaction.add(
    createTransferCheckedInstruction(
      sourceTokenAccount,
      paymentMint,
      destinationAta,
      owner,
      amountRaw,
      decimals,
      [],
      paymentTokenAccount.programId,
    ),
  );

  /**
   * ==========================================================
   * RESULT
   * ==========================================================
   */

  return {
    transaction: serializeTransaction(transaction),

    blockhash,

    lastValidBlockHeight,

    amountUsdt: input.amountUsdt,

    tokenMint: input.tokenMint,

    paymentMint: paymentMint.toBase58(),

    paymentTokenProgram: paymentTokenAccount.programId.toBase58(),

    sourceTokenAccount: sourceTokenAccount.toBase58(),

    destinationTokenAccount: destinationAta.toBase58(),
  };
}
