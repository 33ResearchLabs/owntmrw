import type { HealthScore as HS } from "@/lib/analytics";
import { scoreColor } from "@/lib/analytics";
import { timeAgo } from "@/lib/format";

/**
 * The bands a composite score falls into. Thresholds are `scoreColor`'s own, so
 * the ring arc is always the colour that function would return — the dial
 * cannot disagree with the number printed inside it.
 *
 * `verdict` and `summary` are presentational only: they restate the band the
 * score already sits in, so colour ranks the bands and never has to identify
 * them on its own. No new arithmetic — the band boundaries are unchanged.
 */
const BANDS = [
  {
    from: 0, to: 30, color: "var(--bad)", label: "Weak", verdict: "Critical",
    summary: "The project shows weak health across most measurable dimensions.",
  },
  {
    from: 30, to: 50, color: "var(--serious)", label: "Fragile", verdict: "Needs Attention",
    summary: "The project shows moderate health with several areas that require improvement.",
  },
  {
    from: 50, to: 75, color: "var(--warn)", label: "Mixed", verdict: "Moderate",
    summary: "The project is broadly healthy, with a few dimensions lagging the rest.",
  },
  {
    from: 75, to: 100, color: "var(--good)", label: "Strong", verdict: "Strong",
    summary: "The project scores well across the dimensions public sources can verify.",
  },
];

function bandFor(score: number | null) {
  if (score == null) return null;
  return BANDS.find((b) => score < b.to) ?? BANDS[BANDS.length - 1];
}

/* ---------------------------------------------------------------- icons --- */

/**
 * One glyph per dimension, keyed by `ScoreComponent.key`. The tint is a fixed
 * identity colour, deliberately *not* the score colour: an unmeasured dimension
 * still needs a legible icon, and tinting by score would double-encode a number
 * the row already states twice.
 */
const ICONS: Record<string, { tint: string; path: React.ReactNode }> = {
  treasury: {
    tint: "var(--warn)",
    path: <><path d="M3 9.5 12 4l9 5.5" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8" /><path d="M3 20h18" /></>,
  },
  holders: {
    tint: "var(--serious)",
    path: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6.5a3 3 0 0 1 0 5.5" /><path d="M17.5 15.2A5.5 5.5 0 0 1 21 20" /></>,
  },
  concentration: {
    tint: "var(--bad)",
    path: <><path d="M12 3a9 9 0 1 0 9 9h-9V3Z" /><path d="M14.5 2.6A9 9 0 0 1 21.4 9.5H14.5V2.6Z" /></>,
  },
  liquidity: {
    tint: "var(--good)",
    path: <><path d="M12 3s6 6.2 6 10.2A6 6 0 0 1 6 13.2C6 9.2 12 3 12 3Z" /></>,
  },
  dev: {
    tint: "var(--accent)",
    path: <><path d="m8 7-5 5 5 5" /><path d="m16 7 5 5-5 5" /><path d="m13.5 4-3 16" /></>,
  },
  governance: {
    tint: "#8b7cf6",
    path: <><path d="M3 9.5 12 4l9 5.5" /><path d="M6 10v8M12 10v8M18 10v8" /><path d="M3.5 20h17" /></>,
  },
  momentum: {
    tint: "var(--ink-muted)",
    path: <><path d="M2 12h4l3 7 6-14 3 7h4" /></>,
  },
};

function DimensionIcon({ dkey }: { dkey: string }) {
  const icon = ICONS[dkey];
  if (!icon) return <span className="h-9 w-9 shrink-0" aria-hidden />;
  return (
    <span
      aria-hidden
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border"
      style={{
        color: icon.tint,
        // Tint at low alpha over the card surface, so the disc reads as a
        // recess rather than a second foreground element.
        background: `color-mix(in srgb, ${icon.tint} 13%, transparent)`,
        borderColor: `color-mix(in srgb, ${icon.tint} 22%, transparent)`,
      }}
    >
      <svg
        width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      >
        {icon.path}
      </svg>
    </span>
  );
}

function InfoGlyph({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden
    >
      <circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6h.01" />
    </svg>
  );
}

/* ----------------------------------------------------------------- ring --- */

const RING_R = 78;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Circular gauge for the composite score.
 *
 * The arc encodes the score against a full-circle track; the band it lands in
 * is stated in words in the badge below, so the reading never depends on
 * telling two adjacent hues apart.
 */
function Gauge({ score }: { score: number | null }) {
  const band = bandFor(score);
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: 200, height: 200 }}>
        <svg
          width="200" height="200" viewBox="0 0 200 200"
          role="meter"
          aria-valuenow={score ?? undefined}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={
            score == null
              ? "Composite health score: not scored"
              : `Composite health score ${score} of 100 — ${band?.verdict}`
          }
        >
          <circle
            cx="100" cy="100" r={RING_R}
            fill="none" stroke="var(--grid)" strokeWidth="13"
          />
          {score != null && (
            <circle
              cx="100" cy="100" r={RING_R}
              fill="none"
              stroke={band?.color}
              strokeWidth="13"
              strokeLinecap="round"
              strokeDasharray={`${RING_C * pct} ${RING_C}`}
              // Start the sweep at 12 o'clock instead of 3 o'clock.
              transform="rotate(-90 100 100)"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="num text-[56px] font-semibold leading-none tracking-tight">
            {score ?? "—"}
          </span>
          <span className="num mt-1.5 text-[13px] text-faint">/ 100</span>
        </div>
      </div>

      <span
        className="mt-5 inline-flex items-center rounded-full border px-3.5 py-1.5 text-[12px] font-medium"
        style={{
          color: band?.color ?? "var(--ink-muted)",
          background: `color-mix(in srgb, ${band?.color ?? "var(--ink-muted)"} 12%, transparent)`,
          borderColor: `color-mix(in srgb, ${band?.color ?? "var(--ink-muted)"} 28%, transparent)`,
        }}
      >
        {band?.verdict ?? "Not scored"}
      </span>

      <p className="mt-4 max-w-[230px] text-[12px] leading-relaxed text-ink2">
        {band?.summary ?? "No dimension could be measured from public sources."}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ rows --- */

function DimensionRow({
  c,
}: {
  c: { key: string; label: string; score: number | null; detail: string };
}) {
  const color = scoreColor(c.score);

  return (
    <div
      className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 rounded-lg px-2 py-3.5 transition-colors duration-150 hover:bg-surface2/60 md:grid-cols-[186px_minmax(110px,1fr)_46px_minmax(140px,1.15fr)] md:gap-y-0"
    >
      {/* Dimension */}
      <div className="flex min-w-0 items-center gap-3">
        <DimensionIcon dkey={c.key} />
        <span className="truncate text-[13px] font-medium text-ink">{c.label}</span>
      </div>

      {/* Score — sits beside the label on mobile, in its own column from md up. */}
      <span
        className="num order-2 text-right text-[15px] font-semibold tabular-nums md:order-0 md:col-start-3"
        style={{ color: c.score == null ? "var(--ink-muted)" : color }}
      >
        {c.score ?? "—"}
      </span>

      {/* Progress */}
      <div
        className="order-1 col-span-2 h-2 overflow-hidden rounded-full bg-grid md:order-0 md:col-span-1 md:col-start-2"
        role="meter"
        aria-valuenow={c.score ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${c.label}: ${c.score ?? "not measurable"}`}
      >
        {c.score != null && (
          <div
            className="h-full rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${c.score}%`, background: color }}
          />
        )}
      </div>

      {/* Insights */}
      <span
        className="order-3 col-span-2 text-[12px] leading-snug text-muted md:order-0 md:col-span-1 md:col-start-4 md:truncate"
        title={c.detail}
      >
        {c.detail}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- panel --- */

export function HealthScorePanel({
  hs,
  updatedAt,
  learnMoreHref,
}: {
  hs: HS;
  /** Freshest ingest timestamp behind the score. Omitted → the stamp is hidden. */
  updatedAt?: number | null;
  /** Destination for "Learn more about scoring". Omitted → the button is hidden. */
  learnMoreHref?: string;
}) {
  return (
    <section className="card overflow-hidden">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-5 sm:px-6 sm:py-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[20px] font-semibold leading-tight tracking-tight">
              Project Health Score
            </h2>
            <span
              className="text-faint transition-colors duration-150 hover:text-ink2"
              title="A composite of seven dimensions, each scored 0–100 from public sources. Dimensions that cannot be measured are excluded from the average."
            >
              <InfoGlyph size={15} />
            </span>
          </div>
          <p className="mt-1.5 text-[13px] text-muted">
            Comprehensive on-chain and off-chain health analysis
          </p>
        </div>

        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line2 bg-surface2 px-3 py-1.5 text-[12px] text-ink2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: hs.measured === hs.total ? "var(--good)" : "var(--warn)" }}
            aria-hidden
          />
          {hs.measured} of {hs.total} dimensions measurable
        </span>
      </div>

      {/* Body: score | dimensions */}
      <div className="grid gap-6 border-t border-grid px-5 py-6 sm:px-6 lg:grid-cols-[290px_minmax(0,1fr)] lg:gap-8 lg:py-8">
        <div className="flex items-center justify-center lg:border-r lg:border-grid lg:pr-8">
          <Gauge score={hs.overall} />
        </div>

        <div className="min-w-0">
          {/* Column headers — the mobile layout stacks the cells, so the header
              row would label nothing there. */}
          <div className="hidden grid-cols-[186px_minmax(110px,1fr)_46px_minmax(140px,1.15fr)] items-center gap-x-4 px-2 pb-2.5 text-[10px] uppercase tracking-[0.09em] text-faint md:grid">
            <span>Dimension</span>
            <span />
            <span className="text-right">Score</span>
            <span>Insights</span>
          </div>

          <div className="divide-y divide-grid border-t border-grid">
            {hs.components.map((c) => (
              <DimensionRow key={c.key} c={c} />
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      {(hs.measured < hs.total || updatedAt != null) && (
        <div className="border-t border-grid px-5 py-5 sm:px-6">
          {hs.measured < hs.total && (
            <div className="flex flex-col gap-4 rounded-xl border border-line bg-surface2 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex items-start gap-3">
                <span
                  className="mt-px flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-accent"
                  style={{ background: "var(--accent-dim)" }}
                >
                  <InfoGlyph size={15} />
                </span>
                <p className="text-[12.5px] leading-relaxed text-ink2">
                  Unmeasurable dimensions are excluded from the composite rather than scored as
                  zero, so the headline number reflects only what public sources can verify.
                </p>
              </div>

              {learnMoreHref && (
                <a
                  href={learnMoreHref}
                  className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg border border-line2 px-3.5 py-2 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:border-accent hover:text-accent sm:self-auto"
                >
                  Learn more about scoring
                  <svg
                    width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                  >
                    <path d="m9 5 7 7-7 7" />
                  </svg>
                </a>
              )}
            </div>
          )}

          {updatedAt != null && (
            <div
              className={`flex items-center gap-1.5 text-[11px] text-faint ${
                hs.measured < hs.total ? "mt-4" : ""
              }`}
            >
              <svg
                width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden
              >
                <circle cx="12" cy="12" r="9" /><path d="M12 7v5.2l3.2 1.9" />
              </svg>
              Last updated: {timeAgo(updatedAt)}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
