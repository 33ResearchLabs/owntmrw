import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { ledgerPosition, recordLedgerTrade } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Closes (part of) a simulated position.
 *
 * There's no vault-signed transaction here and none is coming: paying out
 * real USDT on a sell needs the vault to co-sign, which needs a private key
 * this app doesn't have (same reason "buy" can't deliver a real token — see
 * the comment on `ledger_trades`). A sell only ever debits the ledger
 * position this app created; it can't touch tokens the wallet holds from
 * anywhere else, because it never had custody of those either.
 */
export async function POST(req: Request) {
  try {
    const session = await currentAddress();

    if (!session) {
      return NextResponse.json({ error: "not signed in" }, { status: 401 });
    }

    const body = await req.json();
    const { tokenMint, tokenAmount, priceUsd } = body ?? {};

    if (typeof tokenMint !== "string" || !tokenMint) {
      return NextResponse.json(
        { error: "Token mint is required." },
        { status: 400 },
      );
    }

    if (
      typeof tokenAmount !== "number" ||
      !Number.isFinite(tokenAmount) ||
      tokenAmount <= 0
    ) {
      return NextResponse.json(
        { error: "Invalid sell amount." },
        { status: 400 },
      );
    }

    const held = ledgerPosition(session, tokenMint);

    if (tokenAmount > held) {
      return NextResponse.json(
        {
          error:
            held > 0
              ? `You only hold a simulated position of ${held} here.`
              : "You don't hold a simulated position in this token.",
        },
        { status: 400 },
      );
    }

    const price =
      typeof priceUsd === "number" && Number.isFinite(priceUsd) && priceUsd > 0
        ? priceUsd
        : null;

    recordLedgerTrade({
      address: session,
      mint: tokenMint,
      side: "sell",
      tokenAmount,
      priceUsd: price,
      usdAmount: price ? tokenAmount * price : 0,
      txSignature: null,
    });

    return NextResponse.json(
      { ok: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    console.error("[SWAP SELL]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unable to close position.",
      },
      { status: 500 },
    );
  }
}
