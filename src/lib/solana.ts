import { Connection, PublicKey, Transaction } from "@solana/web3.js";

export const SOLANA_RPC_URL =
  process.env.SOLANA_RPC_URL || "https://api.devnet.solana.com";

export const connection = new Connection(SOLANA_RPC_URL, "confirmed");

export const DEVNET = SOLANA_RPC_URL.includes("devnet");

export function assertDevnet() {
  if (!DEVNET) {
    throw new Error(
      "Investment transactions are currently restricted to Solana Devnet.",
    );
  }
}

export function publicKey(value: string | undefined | null): PublicKey {
  if (!value || typeof value !== "string") {
    throw new Error("Solana public key is missing.");
  }

  try {
    return new PublicKey(value);
  } catch {
    throw new Error(`Invalid Solana public key: ${value}`);
  }
}

export async function recentBlockhash() {
  return connection.getLatestBlockhash("confirmed");
}

export async function confirmSignature(signature: string) {
  return connection.confirmTransaction(signature, "confirmed");
}

export function serializeTransaction(transaction: Transaction) {
  return Buffer.from(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
  ).toString("base64");
}
