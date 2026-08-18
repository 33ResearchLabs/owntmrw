import { NextResponse } from "next/server";
import bs58 from "bs58";
import { currentAddress } from "@/lib/session";
import { connection } from "@/lib/solana";
import { recordLedgerTrade } from "@/lib/db";

/** A transaction signature is a 64-byte ed25519 signature, base58-encoded. */
function isSignature(v: unknown): v is string {
  if (typeof v !== "string" || !v) return false;
  try {
    return bs58.decode(v).length === 64;
  } catch {
    return false;
  }
}

export const dynamic = "force-dynamic";

/**
 * Credits the simulated ledger position for a buy whose USDT leg has
 * already landed on-chain.
 *
 * There is no vault inventory or mint authority for any tracked project
 * token (see the comment on `ledger_trades`), so this is the only place a
 * "buy" actually becomes a position — the transaction /api/swap builds only
 * moves USDT into the vault. Crediting happens here, server-side, and only
 * after the transfer is confirmed on-chain and signed by the session
 * wallet, so the position can't be granted by simply POSTing a claim.
 */
export async function POST(req: Request) {
  try {
    const session = await currentAddress();

    if (!session) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }

    const body = await req.json();
    const { signature, tokenMint, amountUsdt, priceUsd } = body ?? {};

    if (!isSignature(signature)) {
      return NextResponse.json(
        { error: "Invalid transaction signature." },
        { status: 400 },
      );
    }

    if (typeof tokenMint !== "string" || !tokenMint) {
      return NextResponse.json(
        { error: "Token mint is required." },
        { status: 400 },
      );
    }

    if (
      typeof amountUsdt !== "number" ||
      !Number.isFinite(amountUsdt) ||
      amountUsdt <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid USDT amount." },
        { status: 400 },
      );
    }

    const price =
      typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0
        ? priceUsd
        : null;

    const tx = await connection.getTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return NextResponse.json(
        { error: "Transaction not confirmed yet. Try again in a moment." },
        { status: 409 },
      );
    }

    if (tx.meta?.err) {
      return NextResponse.json(
        { error: "Transaction failed on-chain." },
        { status: 400 },
      );
    }

    /*
     * The fee payer is index 0 and, for the transaction /api/swap builds, is
     * also the signer who authorized the USDT transfer. Requiring it to
     * match the session prevents crediting a position from someone else's
     * signature.
     */
    const signer = tx.transaction.message.getAccountKeys().get(0)?.toBase58();

    if (signer !== session) {
      return NextResponse.json(
        { error: "Transaction was not signed by the signed-in wallet." },
        { status: 403 },
      );
    }

    const tokenAmount = price ? amountUsdt / price : amountUsdt;

    const recorded = recordLedgerTrade({
      address: session,
      mint: tokenMint,
      side: "buy",
      tokenAmount,
      priceUsd: price,
      usdAmount: amountUsdt,
      txSignature: signature,
    });

    return NextResponse.json(
      { ok: true, tokenAmount, alreadyRecorded: !recorded },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[SWAP CONFIRM]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to confirm the transaction.",
      },
      { status: 500 },
    );
  }
}
