import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { buildInvestmentTransaction } from "@/lib/swap";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    /**
     * The authenticated wallet is the source wallet.
     * We do NOT trust owner from the browser.
     */
    const session = await requireSession("/portfolio");

    const body = await req.json();

    const { tokenMint, amountUsdt, slippageBps } = body ?? {};

    /**
     * --------------------------------------------------------
     * WALLET
     * --------------------------------------------------------
     *
     * The connected/authenticated wallet is always the owner.
     */
    const owner = session;

    if (!owner) {
      return NextResponse.json(
        {
          error: "Authenticated wallet is missing.",
        },
        { status: 401 },
      );
    }

    /**
     * --------------------------------------------------------
     * TOKEN MINT
     * --------------------------------------------------------
     */

    if (typeof tokenMint !== "string" || !tokenMint.trim()) {
      return NextResponse.json(
        {
          error: "Token mint is required.",
        },
        { status: 400 },
      );
    }

    /**
     * --------------------------------------------------------
     * AMOUNT
     * --------------------------------------------------------
     */

    if (
      typeof amountUsdt !== "number" ||
      !Number.isFinite(amountUsdt) ||
      amountUsdt <= 0
    ) {
      return NextResponse.json(
        {
          error: "Invalid USDT investment amount.",
        },
        { status: 400 },
      );
    }

    /**
     * --------------------------------------------------------
     * SLIPPAGE
     * --------------------------------------------------------
     */

    if (
      slippageBps != null &&
      (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 5000)
    ) {
      return NextResponse.json(
        {
          error: "Invalid slippage.",
        },
        { status: 400 },
      );
    }

    /**
     * --------------------------------------------------------
     * BUILD TRANSACTION
     * --------------------------------------------------------
     *
     * owner = authenticated connected wallet
     *
     * vault = resolved server-side inside swap.ts
     *
     * The browser never supplies the vault.
     */
    const result = await buildInvestmentTransaction({
      owner,
      tokenMint: tokenMint.trim(),
      amountUsdt,
      slippageBps: slippageBps ?? 50,
    });

    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[INVESTMENT API]", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to create investment transaction.",
      },
      { status: 500 },
    );
  }
}
