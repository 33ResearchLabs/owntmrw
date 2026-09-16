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

/**
 * Fetch a transaction at `confirmed`, waiting for it if the cluster hasn't
 * got there yet. A wallet's `signAndSendTransaction` resolves as soon as
 * the RPC accepts the transaction, usually a second or two before it is
 * confirmed, so a single `getTransaction` straight after the wallet returns
 * finds nothing. Polls until the transaction shows up or the deadline
 * passes; `null` means it still wasn't confirmed in time.
 */
export async function waitForTransaction(
  signature: string,
  timeoutMs = 25_000,
) {
  const opts = {
    commitment: "confirmed",
    maxSupportedTransactionVersion: 0,
  } as const;
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const tx = await connection.getTransaction(signature, opts);
    if (tx || Date.now() >= deadline) return tx;
    await new Promise((r) => setTimeout(r, 1_500));
  }
}

export function serializeTransaction(transaction: Transaction) {
  return Buffer.from(
    transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    }),
  ).toString("base64");
}
