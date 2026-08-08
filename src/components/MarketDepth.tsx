import type { ProjectDetail } from "@/lib/queries";
import { DAY, changeVsAgo } from "@/lib/series";
import { fmtUsd, timeAgo } from "@/lib/format";
import { Sparkline, DeltaChip, MeterBar, ScaleMarker } from "./viz";

/**
 * A label sat beside a tinted icon here, six different glyphs for six tiles.
 * They encoded nothing — the label already said which measure it was — and
 * they were the last thing making this card look unlike the metric grids
 * beside it, which carry a plain label and no ornament.
 */
function Tile({
  label, value, sub, children,
}: {
  label: string; value: string;
  sub?: string; children?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface2/40 px-4 py-3.5">
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</span>
      <div className="num mt-2 text-[22px] font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

/**
 * Liquidity and valuation at a glance.
 *
 * The valuation series here are rebuilt from the candle history rather than
 * from price snapshots: snapshots are written once per ingest run, so they
 * cluster into whichever hours the ingest happened to run, while candles are
 * daily and actually span time. Liquidity has no candle equivalent, so it
 * comes off `liquidityHistory` — the same rows the treasury cards plot, read
 * raw because a pool's depth genuinely moves on every read.
 */
export function MarketDepthPanel({ d, nowSec }: { d: ProjectDetail; nowSec: number }) {
  const { project: p, latest, candles, quoteSource, liquidityHistory } = d;

  /**
   * Jupiter prices tokens that trade only on MetaDAO's own AMM, and it reports
   * price alone. applyQuote withholds volume and change rather than pairing a
   * live price with a week-old snapshot, so those tiles have no figure at all —
   * which is correct, and needs saying, because a bare dash reads as broken.
   */
  const priceOnlyQuote = quoteSource === "jupiter";
  const noVolumeNote = priceOnlyQuote
    ? "Jupiter quotes price only — no volume reported"
    : undefined;

  const closes = candles.map((c) => c.c);
  const mcapSeries = p.circulating_supply
    ? candles.map((c) => ({ ts: c.ts, v: c.c * p.circulating_supply! })) : [];
  const fdvSeries = p.total_supply
    ? candles.map((c) => ({ ts: c.ts, v: c.c * p.total_supply! })) : [];
  // projectDetail stitches a candle for today out of the live quote, and a
  // quote carries no volume — its v is 0 meaning "unknown", not "nothing
  // traded". Left in, it reads as a total collapse in volume every single day.
  const volSeries = candles.filter((c) => c.v > 0).map((c) => ({ ts: c.ts, v: c.v }));
  const liqSeries = liquidityHistory
    .map((l) => ({ ts: l.ts, v: l.liquidity_usd }))
    .filter((r): r is { ts: number; v: number } => r.v != null);

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
            className="rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] text-ink2 transition-colors hover:border-line2 hover:text-brand"
          >
            View details ↗
          </a>
        )}
      </div>

      <div className="grid gap-3 px-5 py-4 md:grid-cols-2 xl:grid-cols-3">
        <Tile
          label="Liquidity"
          value={fmtUsd(latest?.liquidity_usd)} sub="pool depth, USD"
        >
          <Sparkline values={liqSeries.map((s) => s.v)} color="var(--good)" fallback />
          <div className="mt-1.5">
            <DeltaChip
              pct={changeVsAgo(latest?.liquidity_usd, liqSeries, 7 * DAY, nowSec)}
              period="7d"
              reason={latest?.liquidity_usd == null ? "no live depth to compare" : undefined}
            />
          </div>
        </Tile>

        <Tile
          label="24h Volume"
          value={fmtUsd(latest?.vol24h)}
          sub={noVolumeNote ?? "traded, USD"}
        >
          <Sparkline values={volSeries.map((s) => s.v)} color="#9b7ae0" fallback />
          <div className="mt-1.5">
            <DeltaChip
              pct={changeVsAgo(latest?.vol24h, volSeries, 7 * DAY, nowSec)}
              period="7d"
              reason={latest?.vol24h == null ? "no live volume to compare" : undefined}
            />
          </div>
        </Tile>

        <Tile
          label="Volume / Depth"
          value={turnover != null ? `${turnover.toFixed(2)}×` : "—"}
          // Turnover divides volume by depth, so it goes with its numerator.
          sub={turnover == null && noVolumeNote ? "needs 24h volume — " + noVolumeNote : "turnover ratio"}
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
          label="Market Cap"
          value={fmtUsd(latest?.mcap)} sub="circulating supply"
        >
          <Sparkline values={mcapSeries.map((s) => s.v)} color="#e08a3c" fallback />
          <div className="mt-1.5">
            <DeltaChip pct={changeVsAgo(latest?.mcap, mcapSeries, 7 * DAY, nowSec)} period="7d" />
          </div>
        </Tile>

        <Tile
          label="FDV"
          value={fmtUsd(latest?.fdv)} sub="total supply"
        >
          <Sparkline values={fdvSeries.map((s) => s.v)} color="var(--accent)" fallback />
          <div className="mt-1.5">
            <DeltaChip pct={changeVsAgo(latest?.fdv, fdvSeries, 7 * DAY, nowSec)} period="7d" />
          </div>
        </Tile>

        <Tile
          label="Tradeable Float"
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
