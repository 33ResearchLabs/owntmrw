import { NextResponse } from "next/server";
import { screenerRows } from "@/lib/queries";
import { liveQuotesAsOf } from "@/lib/live";

/**
 * Current quotes for every indexed project, so an open terminal keeps ticking
 * without a reload. Returns the same fields the server rendered, recomputed
 * from the same code path — the client patches rows in place rather than
 * deriving anything of its own.
 */
// Prices must never be baked into a build artifact.
export const dynamic = "force-dynamic";

export async function GET() {
  const rows = await screenerRows();
  return NextResponse.json(
    {
      asOf: liveQuotesAsOf() ?? Date.now(),
      rows: rows.map((r) => ({
        slug: r.slug,
        price_usd: r.price_usd, mcap: r.mcap, fdv: r.fdv,
        liquidity_usd: r.liquidity_usd, vol24h: r.vol24h, change_24h: r.change_24h,
        roi_since_raise: r.roi_since_raise, ath_return: r.ath_return, from_ath: r.from_ath,
      })),
    },
    { headers: { "cache-control": "no-store" } }
  );
}
