/**
 * Turning a quoted price into a market cap is the one calculation the ingest
 * job and the live-quote layer must agree on exactly — if they drift, a page
 * shows one number on load and a different one after the first poll.
 */

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
