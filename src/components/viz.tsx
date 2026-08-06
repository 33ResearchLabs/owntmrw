/**
 * Small in-tile visuals: icon badges, sparklines, delta chips, meters.
 *
 * Every one of these has an explicit not-enough-data state, because the series
 * behind them accumulate at ingest time and are frequently too short to plot.
 * A sparkline drawn through four points looks exactly like one drawn through
 * four hundred, so the thin case has to announce itself rather than render a
 * shape the reader will mistake for a trend.
 */
import { fmtPct } from "@/lib/format";
import { Delta } from "./ui";

// ------------------------------------------------------------------- icons

export type IconName =
  | "chart" | "token" | "users" | "droplet" | "bars" | "target"
  | "pie" | "layers" | "percent" | "shield" | "clock" | "info" | "bank";

/** Stroked 24×24 paths, drawn at the badge's size. No icon dependency. */
const ICONS: Record<IconName, React.ReactNode> = {
  chart: <><path d="M4 19V10M10 19V5M16 19v-6M22 19H2" /></>,
  token: <><circle cx="12" cy="12" r="8" /><path d="M12 8v8M9.5 10.5h5M9.5 13.5h5" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M16 5.5a3 3 0 0 1 0 5.5M18 20a6 6 0 0 0-2-4.5" /></>,
  droplet: <><path d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z" /></>,
  bars: <><path d="M5 20v-6M10 20V7M15 20v-9M20 20V4" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>,
  pie: <><path d="M12 4a8 8 0 1 0 8 8h-8V4Z" /></>,
  layers: <><path d="M12 3 3 8l9 5 9-5-9-5ZM3 13l9 5 9-5" /></>,
  percent: <><path d="M6 18 18 6" /><circle cx="7.5" cy="7.5" r="2" /><circle cx="16.5" cy="16.5" r="2" /></>,
  shield: <><path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6l7-3Z" /></>,
  clock: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  info: <><circle cx="12" cy="12" r="8" /><path d="M12 11v5M12 8h.01" /></>,
  bank: <><path d="M3 10 12 4l9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" /></>,
};

export function Icon({ name, size = 14 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden
    >
      {ICONS[name]}
    </svg>
  );
}

/**
 * A tinted square behind an icon. Decorative identity only — it marks which
 * section a tile belongs to and never encodes a value, so it is free to use a
 * colour the data rules reserve from charts.
 */
export function IconBadge({ name, color, size = 30 }: { name: IconName; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-lg"
      style={{ width: size, height: size, color, background: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      <Icon name={name} size={Math.round(size * 0.47)} />
    </span>
  );
}

// -------------------------------------------------------------- sparklines

/** Below this a series is a handful of dots, not a shape worth reading. */
export const MIN_SERIES_POINTS = 8;

function EmptySeries({ height, label }: { height: number; label: string }) {
  return (
    <div className="flex flex-col justify-end" style={{ height }}>
      <div className="h-px w-full bg-grid" />
      <span className="mt-1 text-[10px] text-faint">{label}</span>
    </div>
  );
}

/**
 * A line + wash sparkline. Colour follows the series' own direction rather than
 * a fixed hue, so the shape and the colour cannot tell different stories.
 */
export function Sparkline({
  values, height = 34, color, label = "needs more history",
}: {
  values: number[]; height?: number; color?: string; label?: string;
}) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < MIN_SERIES_POINTS) return <EmptySeries height={height} label={label} />;

  const min = Math.min(...pts), max = Math.max(...pts);
  const span = max - min || 1;
  const w = 100;
  const step = w / (pts.length - 1);
  const y = (v: number) => height - 3 - ((v - min) / span) * (height - 6);
  const line = pts.map((v, i) => `${i * step},${y(v)}`).join(" ");
  const stroke = color ?? (pts[pts.length - 1] >= pts[0] ? "var(--good)" : "var(--bad)");
  const gid = `sp${Math.round(pts[0] * 1e6)}-${pts.length}`;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${line} ${w},${height}`} fill={`url(#${gid})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.5"
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * An icon, a headline figure, a period-over-period delta and the series
 * behind it — one card, reused everywhere a metric has real history to plot.
 *
 * Nothing here computes: `value`, `deltaPct` and `series` all arrive already
 * derived, so a caller with no genuine trend for a metric simply has nothing
 * to pass rather than reaching for a placeholder. `Sparkline`'s own
 * `MIN_SERIES_POINTS` gate still applies underneath — a metric with real but
 * thin history renders its "needs more history" state rather than a two-dot
 * line that looks like a shape.
 */
export function TrendCard({
  color, label, value, deltaPct, deltaLabel, series, title,
}: {
  /** Tints the sparkline stroke. */
  color: string;
  label: string;
  value: React.ReactNode;
  /** Percent change vs. the start of the window `deltaLabel` names. */
  deltaPct?: number | null;
  /** What the delta is measured against, e.g. "vs 30d ago". */
  deltaLabel?: string;
  series: number[];
  /**
   * A methodology note, shown as a hover tooltip on the label. For a figure
   * whose method could disagree with a plainer-looking number shown
   * elsewhere on the same page — e.g. a growth rate computed with a supply
   * held constant, next to a valuation that used the supply at the time —
   * the gap reads as a bug unless the card says why.
   */
  title?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface2/30 p-4">
      <span className="text-[11px] uppercase tracking-[0.07em] text-muted" title={title}>
        {label}
        {title && <span className="text-faint"> ⓘ</span>}
      </span>
      <div className="num mt-2.5 text-[20px] font-semibold leading-none">{value}</div>
      {deltaPct !== undefined && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px]">
          <Delta v={deltaPct} />
          {deltaLabel && <span className="text-muted">{deltaLabel}</span>}
        </div>
      )}
      <div className="mt-3">
        <Sparkline values={series} height={32} color={color} />
      </div>
    </div>
  );
}

/**
 * Discrete bars — for volume, where each period is its own quantity.
 *
 * Two things this has to survive that a naive bar chart does not. A year of
 * daily candles is more bars than the tile has pixels, so only the most recent
 * `maxBars` are drawn and each is allowed to shrink below a pixel rather than
 * holding a minimum width and pushing the chart out of its container. And
 * volume is violently skewed — one launch day can be fifty times the median —
 * so bars are scaled to the 95th percentile instead of the maximum. Anything
 * above it clips at full height and is drawn at full opacity so the outlier
 * still reads as an outlier rather than quietly setting the scale for
 * everything else.
 */
export function MiniBars({
  values, height = 34, color = "var(--accent)", label = "needs more history", maxBars = 60,
}: {
  values: number[]; height?: number; color?: string; label?: string; maxBars?: number;
}) {
  const all = values.filter((v) => Number.isFinite(v));
  if (all.length < MIN_SERIES_POINTS) return <EmptySeries height={height} label={label} />;

  const pts = all.slice(-maxBars);
  const sorted = [...pts].sort((a, b) => a - b);
  const scale = sorted[Math.floor(sorted.length * 0.95)] || Math.max(...pts) || 1;
  const clipped = pts.filter((v) => v > scale).length;

  return (
    <div
      className="flex items-end gap-px overflow-hidden"
      style={{ height }}
      title={
        `last ${pts.length} of ${all.length} periods` +
        (clipped ? ` · ${clipped} above the 95th-percentile scale` : "")
      }
    >
      {pts.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-t-[1px]"
          style={{
            height: `${Math.min(100, (v / scale) * 100)}%`,
            minHeight: 1,
            background: color,
            opacity: v > scale ? 1 : 0.7,
          }}
        />
      ))}
    </div>
  );
}

// ------------------------------------------------------------ delta chips

/**
 * A period-over-period change pill.
 *
 * `pct` is null whenever the comparison cannot honestly be made, but there is
 * more than one way for that to happen — no reading from the period ago, or no
 * current reading to compare it against. `reason` lets the caller say which,
 * because a chip that blames missing history for a missing live quote sends
 * the reader looking in the wrong place.
 */
export function DeltaChip({
  pct, period, reason,
}: {
  pct: number | null; period: string; reason?: string;
}) {
  if (pct == null) {
    return (
      <span className="inline-flex items-center rounded-md bg-surface2 px-1.5 py-0.5 text-[10.5px] text-faint">
        {reason ?? `needs ${period} of history`}
      </span>
    );
  }
  const flat = Math.abs(pct) < 0.005;
  const cls = flat ? "text-muted" : pct > 0 ? "text-good" : "text-bad";
  return (
    <span className={`inline-flex items-center gap-1 rounded-md bg-surface2 px-1.5 py-0.5 text-[10.5px] ${cls}`}>
      <span className="text-[8px]">{flat ? "—" : pct > 0 ? "▲" : "▼"}</span>
      <span className="num">{fmtPct(pct, false)}</span>
      <span className="text-faint">vs {period} ago</span>
    </span>
  );
}

// ----------------------------------------------------------------- meters

/** A 0→100% fill with an optional verdict word. */
export function MeterBar({
  pct, color = "var(--accent)", ticks, verdict, verdictColor,
}: {
  pct: number | null;
  color?: string;
  /** Scale labels under the track, evenly spaced. */
  ticks?: string[];
  verdict?: string;
  verdictColor?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-grid">
          {pct != null && (
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }}
            />
          )}
        </div>
        {pct != null && (
          <span className="num shrink-0 text-[10.5px] text-muted">{pct.toFixed(0)}%</span>
        )}
      </div>
      {ticks && (
        <div className="mt-1 flex justify-between text-[9.5px] text-faint">
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>
      )}
      {verdict && (
        <span className="mt-1.5 inline-flex rounded-md px-1.5 py-0.5 text-[10.5px] font-medium"
          style={{ color: verdictColor, background: `color-mix(in srgb, ${verdictColor} 14%, transparent)` }}>
          {verdict}
        </span>
      )}
    </div>
  );
}

/**
 * A marker on a fixed scale, for a ratio whose meaning comes from where it sits
 * rather than how far it has filled — turnover being the case in point, where
 * both a very low and a very high reading are worth noticing.
 */
export function ScaleMarker({
  value, max, ticks, color,
}: {
  value: number | null; max: number; ticks: string[]; color: string;
}) {
  const at = value == null ? null : Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div>
      <div className="relative h-1.5 rounded-full" style={{ background: "var(--grid)" }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: "100%", background: "linear-gradient(90deg, var(--good), var(--warn), var(--bad))", opacity: 0.5 }}
        />
        {at != null && (
          <span
            className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2"
            style={{ left: `${at}%`, background: color, borderColor: "var(--surface)" }}
          />
        )}
      </div>
      <div className="mt-1 flex justify-between text-[9.5px] text-faint">
        {ticks.map((t) => <span key={t}>{t}</span>)}
      </div>
    </div>
  );
}
