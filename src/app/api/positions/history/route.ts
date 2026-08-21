import { NextResponse } from "next/server";
import { currentAddress } from "@/lib/session";
import { ledgerTradeHistory, ledgerCostBasis } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * The signed-in wallet's simulated trade history plus average-cost basis
 * per mint, so Portfolio can show what was actually bought/sold and
 * whether each simulated position is currently ahead or behind.
 */
export async function GET() {
  const session = await currentAddress();

  if (!session) {
    return NextResponse.json({ error: "not signed in" }, { status: 401 });
  }

  const trades = ledgerTradeHistory(session, 50);
  const costBasis = Object.fromEntries(ledgerCostBasis(session));

  return NextResponse.json(
    { trades, costBasis },
    { headers: { "cache-control": "no-store" } },
  );
}
