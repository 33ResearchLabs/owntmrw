import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { buildInvestmentTransaction } from "@/lib/swap";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const session = await requireSession("/portfolio");

    const body = await req.json();

    const { owner, tokenMint, amountUsdt, slippageBps } = body ?? {};

    if (!owner) {
      return NextResponse.json(
        {
          error: "Wallet address is required.",
        },
        { status: 400 },
      );
    }

    /*
     * Never trust the wallet address sent by
     * the browser. It must match the authenticated
     * session.
     */
    if (owner !== session) {
      return NextResponse.json(
        {
          error: "Wallet does not match the signed-in session.",
        },
        { status: 403 },
      );
    }

    if (typeof tokenMint !== "string" || !tokenMint) {
      return NextResponse.json(
        {
          error: "Token mint is required.",
        },
        { status: 400 },
      );
    }

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

    const result = await buildInvestmentTransaction({
      owner,
      tokenMint,
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
