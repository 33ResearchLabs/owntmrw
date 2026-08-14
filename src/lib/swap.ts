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

const USDT_MINT = process.env.SOLANA_USDT_MINT;

const INVESTMENT_VAULT = process.env.INVESTMENT_VAULT_ADDRESS;

if (!USDT_MINT) {
  console.warn("[INVESTMENT] SOLANA_USDT_MINT is not configured.");
}

if (!INVESTMENT_VAULT) {
  console.warn("[INVESTMENT] INVESTMENT_VAULT_ADDRESS is not configured.");
}

export interface InvestmentRequest {
  owner: string;
  tokenMint: string;
  amountUsdt: number;
  slippageBps?: number;
}

export interface InvestmentTransaction {
  transaction: string;
  blockhash: string;
  lastValidBlockHeight: number;
  amountUsdt: number;
  tokenMint: string;
}

function env(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`${name} is not configured.`);
  }

  return value;
}

export async function buildInvestmentTransaction(
  input: InvestmentRequest,
): Promise<InvestmentTransaction> {
  assertDevnet();

  if (!Number.isFinite(input.amountUsdt)) {
    throw new Error("Invalid investment amount.");
  }

  if (input.amountUsdt <= 0) {
    throw new Error("Investment amount must be greater than zero.");
  }

  const owner = publicKey(input.owner);

  const tokenMint = publicKey(input.tokenMint);

  const usdtMint = publicKey(env(USDT_MINT, "SOLANA_USDT_MINT"));

  const vault = publicKey(env(INVESTMENT_VAULT, "INVESTMENT_VAULT_ADDRESS"));

  /*
   * Make sure the requested token is a valid Solana
   * mint. We don't transfer this token here — it identifies
   * the project being invested in and is recorded by the
   * application layer.
   */
  await getMint(connection, tokenMint, "confirmed");

  const mintInfo = await getMint(connection, usdtMint, "confirmed");

  const decimals = mintInfo.decimals;

  const amountRaw = BigInt(Math.round(input.amountUsdt * 10 ** decimals));

  if (amountRaw <= 0) {
    throw new Error("Investment amount is too small.");
  }

  const sourceAta = await getAssociatedTokenAddress(
    usdtMint,
    owner,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const destinationAta = await getAssociatedTokenAddress(
    usdtMint,
    vault,
    false,
    TOKEN_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  /*
   * Verify the user's USDT token account exists.
   */
  try {
    await getAccount(connection, sourceAta, "confirmed", TOKEN_PROGRAM_ID);
  } catch {
    throw new Error(
      "Your wallet does not have a USDT token account on Devnet.",
    );
  }

  /*
   * Verify the vault USDT account exists.
   *
   * For now we deliberately do not create ATAs automatically
   * from an investment API. The vault should be prepared before
   * accepting deposits.
   */
  try {
    await getAccount(connection, destinationAta, "confirmed", TOKEN_PROGRAM_ID);
  } catch {
    throw new Error(
      "Investment vault does not have a USDT token account on Devnet.",
    );
  }

  const { blockhash, lastValidBlockHeight } = await recentBlockhash();

  const transaction = new Transaction({
    feePayer: owner,
    recentBlockhash: blockhash,
  });

  transaction.add(
    createTransferCheckedInstruction(
      sourceAta,
      usdtMint,
      destinationAta,
      owner,
      amountRaw,
      decimals,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  return {
    transaction: serializeTransaction(transaction),
    blockhash,
    lastValidBlockHeight,
    amountUsdt: input.amountUsdt,
    tokenMint: input.tokenMint,
  };
}
