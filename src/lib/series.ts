/**
 * Period-over-period change, computed the same way everywhere.
 *
 * Two panels grew their own version of this and disagreed: the market tiles
 * accept a reading within two days of the date they claim, while the holder
 * tiles demanded one at or before the exact instant. Metadao's oldest holder
 * snapshot missed the seven-day mark by six and a half hours, so "Net 7d" read
 * empty while the volume tile beside it happily reported a 7d change from the
 * very same afternoon.
 */

export const DAY = 86400;

/**
 * How far from the date it claims a lookback reading may sit.
 *
 * Snapshots land whenever ingest happens to run, not on the hour a window
 * opens, and a series can miss a day. Two days either side keeps the label
 * honest while letting a real comparison through.
 */
export const LOOKBACK_TOLERANCE = 2 * DAY;

/**
 * Change from a window ago to `current`, or null when the comparison cannot
 * honestly be made.
 *
 * `current` is the figure being displayed, not the last point in the series:
 * the two differ whenever a headline is live and the series is archived, and
 * taking the series' own end as "now" reports a change between two historical
 * readings underneath a number neither of them describes.
 *
 * The lookback is anchored to the clock rather than to the end of the series,
 * so a series that stops updating stops producing deltas instead of comparing
 * whatever two points it still holds.
 */
export function changeVsAgo(
  current: number | null | undefined,
  series: { ts: number; v: number }[],
  windowSec: number,
  nowSec: number
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  if (series.length < 2) return null;

  const target = nowSec - windowSec;
  let best: { ts: number; v: number } | null = null;
  for (const p of series) {
    if (Math.abs(p.ts - target) > LOOKBACK_TOLERANCE) continue;
    if (!best || Math.abs(p.ts - target) < Math.abs(best.ts - target)) best = p;
  }
  if (!best || !best.v) return null;
  return ((current - best.v) / best.v) * 100;
}

/** The absolute difference over the same window, for counts rather than rates. */
export function deltaVsAgo(
  current: number | null | undefined,
  series: { ts: number; v: number }[],
  windowSec: number,
  nowSec: number
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  const pct = changeVsAgo(current, series, windowSec, nowSec);
  if (pct == null) return null;
  const target = nowSec - windowSec;
  let best: { ts: number; v: number } | null = null;
  for (const p of series) {
    if (Math.abs(p.ts - target) > LOOKBACK_TOLERANCE) continue;
    if (!best || Math.abs(p.ts - target) < Math.abs(best.ts - target)) best = p;
  }
  return best ? current - best.v : null;
}
