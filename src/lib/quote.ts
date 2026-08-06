/**
 * Turning a quoted price into a market cap is the one calculation the ingest
 * job and the live-quote layer must agree on exactly — if they drift, a page
 * shows one number on load and a different one after the first poll.
 */

/**
 * Minimum pool depth for a quoted price to be treated as a real market price.
 * Below this, a handful of dollars moves the price arbitrarily, so returns
 * computed against it are marked rather than read as fact.
 *
 * It lives here rather than beside the queries that apply it because the
 * screener table is a client component and needs it to caption the marker —
 * importing it from the query layer dragged better-sqlite3 into the browser
 * bundle. This module is pure arithmetic and safe on both sides.
 */
export const MIN_LIQUIDITY_USD = 10_000;

export function priceIsReliable(liquidityUsd: number | null | undefined): boolean {
  return liquidityUsd != null && liquidityUsd >= MIN_LIQUIDITY_USD;
}

/**
 * Prefer MetaDAO's own supply figure over whatever the venue reports.
 * DexScreener reports FDV as `marketCap` for most of these tokens (team
 * packages are still locked), so where we know the circulating supply we
 * compute the cap ourselves and only fall back to the reported figure when
 * the supply is unknown.
 */
export function capFromSupply(
  price: number | null,
  supply: number | null | undefined,
  reported: number | null | undefined
): number | null {
  if (price != null && supply) return price * supply;
  return reported ?? null;
}

/**
 * A circulating supply below one whole token means "not yet distributed",
 * not a sub-dollar market cap. Venues that quote such a token still publish
 * a market cap; it is meaningless, so we withhold it rather than print it.
 */
export function isUndistributed(circulatingSupply: number | null | undefined): boolean {
  return (circulatingSupply ?? 0) < 1;
}

/**
 * The market cap to publish, or null when there is honestly no such number.
 *
 * Both quote paths must go through this. The undistributed guard used to sit on
 * the Jupiter branch only, so a token DexScreener happened to price skipped it
 * and fell through to the venue's own figure — Ranger, whose circulating supply
 * is zero, was published at a $1,428 market cap against a $112,595 FDV.
 *
 * A supply of null means "we do not know", which is not the same as zero: the
 * venue's reported cap is still the best available answer there, so only a
 * known-and-undistributed supply withholds one.
 */
export function marketCap(
  price: number | null,
  circulating: number | null | undefined,
  reported: number | null | undefined
): number | null {
  if (circulating != null && isUndistributed(circulating)) return null;
  return capFromSupply(price, circulating, reported);
}
