import type { ProjectDetail } from "@/lib/queries";
import { fmtUsd, timeAgo } from "@/lib/format";
import {
  IconBadge, Sparkline, MiniBars, DeltaChip, MeterBar, ScaleMarker,
  MIN_SERIES_POINTS, type IconName,
} from "./viz";

const DAY = 86400;

/**
 * Change from a window ago to the figure the tile is actually showing.
 *
 * `current` is the headline value, not the last point in the series. The two
 * are different things: the headline is a live quote while the series is
 * archived candles, and taking the series' own last point as "now" produced a
 * +2976% under a headline that had not moved 30× — it was measuring a
 * week-old candle against an older one and stamping it beneath a live number.
 *
 * The lookback is anchored to the clock rather than to the end of the series,
 * and must land within a fifth of the window of the date it claims. A series
 * that has stopped updating therefore stops producing deltas instead of
 * comparing whatever two points it happens to still hold.
 */
function changeVsAgo(
  current: number | null | undefined,
  series: { ts: number; v: number }[],
  windowSec: number,
  nowSec: number
): number | null {
  if (current == null || !Number.isFinite(current)) return null;
  if (series.length < MIN_SERIES_POINTS) return null;

  const target = nowSec - windowSec;
  const tolerance = windowSec * 0.2;
  let best: { ts: number; v: number } | null = null;
  for (const p of series) {
    if (Math.abs(p.ts - target) > tolerance) continue;
    if (!best || Math.abs(p.ts - target) < Math.abs(best.ts - target)) best = p;
  }
  if (!best || !best.v) return null;
  return ((current - best.v) / best.v) * 100;
}

function Tile({
  icon, color, label, value, sub, children,
}: {
  icon: IconName; color: string; label: string; value: string;
  sub?: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface2/40 px-4 py-3.5">
      <div className="flex items-center gap-2.5">
        <IconBadge name={icon} color={color} />
        <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</span>
      </div>
      <div className="num mt-2 text-[22px] font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

/**
 * Liquidity and valuation at a glance.
 *
 * The series here are rebuilt from the candle history rather than from price
 * snapshots: snapshots are written once per ingest run, so they cluster into
 * whichever hours the ingest happened to run, while candles are daily and
 * actually span time. Liquidity has no candle equivalent and so has no series
 * until pool depth is archived per day.
 */
export function MarketDepthPanel({ d }: { d: ProjectDetail }) {
  const { project: p, latest, candles } = d;

  const closes = candles.map((c) => c.c);
  const mcapSeries = p.circulating_supply
    ? candles.map((c) => ({ ts: c.ts, v: c.c * p.circulating_supply! })) : [];
  const fdvSeries = p.total_supply
    ? candles.map((c) => ({ ts: c.ts, v: c.c * p.total_supply! })) : [];
  // projectDetail stitches a candle for today out of the live quote, and a
  // quote carries no volume — its v is 0 meaning "unknown", not "nothing
  // traded". Left in, it reads as a total collapse in volume every single day.
  const volSeries = candles.filter((c) => c.v > 0).map((c) => ({ ts: c.ts, v: c.v }));
  const now = Math.floor(Date.now() / 1000);

  const turnover = latest?.vol24h && latest.liquidity_usd
    ? latest.vol24h / latest.liquidity_usd : null;
  // Turnover reads in both directions: a dead pool and a churning one are both
  // worth flagging, so this is a band on a scale, not a "higher is better" bar.
  const turnoverVerdict = turnover == null ? null
    : turnover < 0.05 ? { text: "Illiquid", color: "var(--serious)" }
    : turnover <= 1 ? { text: "Healthy", color: "var(--good)" }
    : turnover <= 2 ? { text: "Elevated", color: "var(--warn)" }
    : { text: "Churning", color: "var(--bad)" };

  const floatPct = p.circulating_supply && p.total_supply
    ? (p.circulating_supply / p.total_supply) * 100 : null;
  const floatVerdict = floatPct == null ? null
    : floatPct >= 75 ? { text: "High float", color: "var(--good)" }
    : floatPct >= 40 ? { text: "Moderate", color: "var(--warn)" }
    : { text: "Thin float", color: "var(--serious)" };

  const lastCandle = candles.length ? candles[candles.length - 1].ts : null;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-grid px-5 py-4">
        <div>
          <h2 className="text-[15px] font-semibold">Market Depth &amp; Risk</h2>
          <p className="mt-0.5 text-[12px] text-muted">
            Liquidity and valuation for {p.symbol ?? p.name}
          </p>
        </div>
        {p.mint && (
          <a
            href={`https://dexscreener.com/solana/${p.mint}`}
            target="_blank" rel="noopener noreferrer"
            className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-ink2 transition-colors hover:border-line2 hover:text-accent"
          >
            View details ↗
          </a>
        )}
      </div>

      <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile
          icon="droplet" color="var(--accent)" label="Liquidity"
          value={fmtUsd(latest?.liquidity_usd)} sub="pool depth, USD"
        >
          {/* No daily liquidity series exists — pool depth is only captured at
              ingest time, so there is nothing honest to draw here yet. */}
          <Sparkline values={[]} label="pool depth is not archived daily" />
        </Tile>

        <Tile
          icon="bars" color="#9b7ae0" label="24h Volume"
          value={fmtUsd(latest?.vol24h)} sub="traded, USD"
        >
          <MiniBars values={volSeries.map((s) => s.v)} color="#9b7ae0" />
          <div className="mt-1.5">
            <DeltaChip pct={changeVsAgo(latest?.vol24h, volSeries, 7 * DAY, now)} period="7d" />
          </div>
        </Tile>

        <Tile
          icon="target" color="var(--good)" label="Volume / Depth"
          value={turnover != null ? `${turnover.toFixed(2)}×` : "—"} sub="turnover ratio"
        >
          <ScaleMarker
            value={turnover} max={2} ticks={["0", "1", "2+"]}
            color={turnoverVerdict?.color ?? "var(--ink-muted)"}
          />
          {turnoverVerdict && (
            <span className="mt-1.5 inline-flex rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
              style={{ color: turnoverVerdict.color, background: `color-mix(in srgb, ${turnoverVerdict.color} 14%, transparent)` }}>
              {turnoverVerdict.text}
            </span>
          )}
        </Tile>

        <Tile
          icon="pie" color="#e08a3c" label="Market Cap"
          value={fmtUsd(latest?.mcap)} sub="circulating supply"
        >
          <Sparkline values={mcapSeries.map((s) => s.v)} color="#e08a3c" />
          <div className="mt-1.5">
            <DeltaChip pct={changeVsAgo(latest?.mcap, mcapSeries, 7 * DAY, now)} period="7d" />
          </div>
        </Tile>

        <Tile
          icon="layers" color="var(--accent)" label="FDV"
          value={fmtUsd(latest?.fdv)} sub="total supply"
        >
          <Sparkline values={fdvSeries.map((s) => s.v)} color="var(--accent)" />
          <div className="mt-1.5">
            <DeltaChip pct={changeVsAgo(latest?.fdv, fdvSeries, 7 * DAY, now)} period="7d" />
          </div>
        </Tile>

        <Tile
          icon="percent" color="var(--warn)" label="Tradeable Float"
          value={floatPct != null ? `${floatPct.toFixed(0)}%` : "—"} sub="of total supply"
        >
          <MeterBar
            pct={floatPct} color="var(--warn)" ticks={["0%", "50%", "100%"]}
            verdict={floatVerdict?.text} verdictColor={floatVerdict?.color}
          />
        </Tile>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-grid px-5 py-3 text-[11.5px] text-muted">
        <span>
          Quote {latest?.price_usd != null ? "live" : "unavailable"} · candles through{" "}
          {lastCandle ? timeAgo(lastCandle) : "—"}
        </span>
        <span className="text-faint">
          {closes.length} daily candle{closes.length === 1 ? "" : "s"} on file
        </span>
      </div>
    </section>
  );
}
