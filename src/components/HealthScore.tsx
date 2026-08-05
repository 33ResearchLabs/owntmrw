import type { HealthScore as HS } from "@/lib/analytics";
import { scoreColor } from "@/lib/analytics";
import { timeAgo } from "@/lib/format";

/**
 * The bands the dial reads into. Thresholds are `scoreColor`'s own, so the arc
 * a score draws is always the colour that function would return — the dial
 * cannot disagree with the number printed inside it.
 *
 * `summary` restates the band in words. Two of the four colours (Mixed and
 * Fragile) are close enough in hue that a reader cannot reliably name them
 * side by side, so the band is always also stated in text: colour ranks the
 * bands, it never has to identify them.
 */
const BANDS = [
  {
    from: 0, to: 30, color: "var(--bad)", label: "Weak",
    summary: "Most measured dimensions score in the bottom band.",
  },
  {
    from: 30, to: 50, color: "var(--serious)", label: "Fragile",
    summary: "The measured dimensions are mixed, with several scoring in the bottom band.",
  },
  {
    from: 50, to: 75, color: "var(--warn)", label: "Mixed",
    summary: "Most measured dimensions score mid-range or better.",
  },
  {
    from: 75, to: 100, color: "var(--good)", label: "Strong",
    summary: "Measured dimensions score consistently in the top band.",
  },
];

type Band = (typeof BANDS)[number];

const bandFor = (score: number | null): Band | null =>
  score == null ? null : BANDS.find((b) => score < b.to) ?? BANDS[BANDS.length - 1];

// ---------------------------------------------------------------- icons

/** 16px line icons on a 24-box, one per dimension key. Stroke inherits colour. */
const ICONS: Record<string, React.ReactNode> = {
  // Treasury — vault columns
  treasury: <><path d="M3 21h18M4 21V10m4 11V10m8 11V10m4 11V10M2 10 12 4l10 6" /></>,
  // Holder Growth — people
  holders: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0M17 6.2a3 3 0 0 1 0 5.6M18.5 20a5.5 5.5 0 0 0-2.7-4.7" /></>,
  // Distribution — share of a whole
  concentration: <><circle cx="12" cy="12" r="9" /><path d="M12 3v9l7 5" /></>,
  // Liquidity — droplet
  liquidity: <><path d="M12 3s6 6.2 6 10a6 6 0 0 1-12 0c0-3.8 6-10 6-10Z" /></>,
  // Developer Activity — angle brackets
  dev: <><path d="m8 8-5 4 5 4M16 8l5 4-5 4" /></>,
  // Governance — chamber
  governance: <><path d="M3 21h18M5 21V11m6 10V11m8 10V11M12 3 3.5 7.5h17L12 3Z" /></>,
  // Momentum — trend pulse
  momentum: <><path d="M2 13h4l3-7 4 14 3-7h6" /></>,
};

function DimensionIcon({ dkey }: { dkey: string }) {
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-surface2 transition-colors duration-150 group-hover/row:border-line2"
      aria-hidden
    >
      <svg
        width="15" height="15" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
        className="text-muted transition-colors duration-150 group-hover/row:text-ink2"
      >
        {ICONS[dkey] ?? <circle cx="12" cy="12" r="8" />}
      </svg>
    </span>
  );
}

function InfoIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden
    >
      <circle cx="12" cy="12" r="9" /><path d="M12 16v-4.5M12 8h.01" />
    </svg>
  );
}

// ---------------------------------------------------------------- dial

const R = 78;
const CIRC = 2 * Math.PI * R;

/**
 * Ring gauge for the composite score. The arc is drawn in the band's own colour
 * and the number sits in the middle of the ring, where nothing can cross it.
 */
function Dial({ score, band }: { score: number | null; band: Band | null }) {
  const pct = score == null ? 0 : Math.max(0, Math.min(100, score)) / 100;

  return (
    <div className="relative h-[184px] w-[184px] shrink-0 sm:h-[200px] sm:w-[200px]">
      <svg viewBox="0 0 192 192" className="h-full w-full -rotate-90">
        <circle cx="96" cy="96" r={R} fill="none" stroke="var(--grid)" strokeWidth="13" />
        {score != null && (
          <circle
            cx="96" cy="96" r={R}
            fill="none"
            stroke={band?.color ?? scoreColor(score)}
            strokeWidth="13"
            strokeLinecap="round"
            strokeDasharray={`${pct * CIRC} ${CIRC}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[52px] font-semibold leading-none tracking-tight sm:text-[58px]">
          {score ?? "—"}
        </span>
        <span className="mt-2 text-[12px] text-faint">/ 100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- panel

function LearnMore() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-line2 bg-white/[0.04] px-3.5 py-2 text-[12.5px] font-semibold text-ink transition-colors duration-150 hover:bg-white/[0.09]">
      Learn more about scoring
      <svg
        width="13" height="13" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
        className="transition-transform duration-200 group-open:rotate-90" aria-hidden
      >
        <path d="m9 5 7 7-7 7" />
      </svg>
    </span>
  );
}

export function HealthScorePanel({ hs, updatedTs }: { hs: HS; updatedTs?: number | null }) {
  const band = bandFor(hs.overall);
  const allMeasured = hs.measured >= hs.total;

  return (
    <section className="card overflow-hidden">
      {/* ---------- header ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3 border-b border-grid px-5 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-tight sm:text-[19px]">
              Project Health Score
            </h2>
            <InfoIcon
              className="shrink-0 text-faint transition-colors duration-150 hover:text-ink2"
            />
          </div>
          <p className="mt-1 text-[12.5px] text-muted">
            Comprehensive on-chain and off-chain health analysis
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line bg-surface2 px-3.5 py-2 text-[12px] font-medium text-ink2">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: allMeasured ? "var(--good)" : "var(--ink-faint)" }}
            aria-hidden
          />
          {hs.measured} of {hs.total} dimensions measurable
        </span>
      </div>

      {/* ---------- body: dial | dimensions ---------- */}
      <div className="flex flex-col lg:flex-row">
        <div className="flex flex-col items-center justify-center gap-4 border-b border-grid px-6 py-7 text-center lg:w-[286px] lg:shrink-0 lg:border-b-0 lg:border-r lg:px-7 lg:py-8">
          <Dial score={hs.overall} band={band} />
          <span
            className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold"
            style={{
              color: band?.color ?? "var(--ink-muted)",
              background: band ? `color-mix(in srgb, ${band.color} 14%, transparent)` : "var(--surface-2)",
              border: `1px solid ${band ? `color-mix(in srgb, ${band.color} 34%, transparent)` : "var(--hair)"}`,
            }}
          >
            {band?.label ?? "Not scored"}
          </span>
          <p className="max-w-[240px] text-[12.5px] leading-relaxed text-muted">
            {band?.summary ?? "No dimension could be measured from public sources."}
          </p>
        </div>

        <div className="min-w-0 flex-1 px-5 py-4 sm:px-6 sm:py-5">
          {/* column headers — md and up, where the grid actually has columns */}
          <div className="hidden grid-cols-[176px_minmax(0,1fr)_44px_minmax(0,208px)] gap-4 border-b border-grid pb-2.5 text-[10.5px] font-semibold uppercase tracking-[0.09em] text-faint md:grid">
            <span>Dimension</span>
            <span />
            <span className="text-right">Score</span>
            <span>Insights</span>
          </div>

          {hs.components.map((c) => (
            <div
              key={c.key}
              className="group/row -mx-2 flex flex-col gap-2.5 border-b border-line px-2 py-3.5 transition-colors duration-150 last:border-b-0 hover:bg-white/[0.02] md:grid md:grid-cols-[176px_minmax(0,1fr)_44px_minmax(0,208px)] md:items-center md:gap-4 md:py-3"
            >
              <div className="flex items-center justify-between gap-3 md:justify-start">
                <span className="flex min-w-0 items-center gap-2.5">
                  <DimensionIcon dkey={c.key} />
                  <span className="truncate text-[13px] font-medium text-ink2">{c.label}</span>
                </span>
                <span className="num shrink-0 text-[15px] font-semibold md:hidden" style={{ color: scoreColor(c.score) }}>
                  {c.score ?? "—"}
                </span>
              </div>

              <div className="h-2.5 overflow-hidden rounded-full bg-grid">
                {c.score != null && (
                  <div
                    className="h-full rounded-full transition-[width] duration-300"
                    style={{ width: `${c.score}%`, background: scoreColor(c.score) }}
                  />
                )}
              </div>

              <span
                className="num hidden text-right text-[15px] font-semibold md:block"
                style={{ color: scoreColor(c.score) }}
              >
                {c.score ?? "—"}
              </span>

              <span className="text-[12px] text-muted md:truncate" title={c.detail}>
                {c.detail}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------- footer ---------- */}
      <div className="border-t border-grid px-5 py-4 sm:px-6 sm:py-5">
        <details className="group">
          <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
            {allMeasured ? (
              <div className="flex justify-end">
                <LearnMore />
              </div>
            ) : (
              <div className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface2 px-4 py-4 transition-colors duration-150 hover:border-line2 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-accent"
                  style={{ background: "var(--accent-dim)" }}
                  aria-hidden
                >
                  <InfoIcon />
                </span>
                <p className="flex-1 text-[12.5px] leading-relaxed text-ink2">
                  Unmeasurable dimensions are excluded from the composite rather than scored as zero,
                  so the headline number reflects only what public sources can verify.
                </p>
                <LearnMore />
              </div>
            )}
          </summary>

          <div className="mt-3 rounded-xl border border-line bg-surface2 px-4 py-4 sm:px-5">
            <p className="text-[12.5px] leading-relaxed text-ink2">
              Every dimension is scored 0–100 from data we hold; the headline is the unweighted mean
              of the dimensions that could be measured. The bands below are the same thresholds the
              dial and the per-dimension colours use.
            </p>
            <div className="mt-3.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {BANDS.map((b) => (
                <div key={b.from} className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: b.color }} aria-hidden />
                  <span className="text-[12.5px] font-medium">{b.label}</span>
                  <span className="num text-[11.5px] text-faint">{b.from}–{b.to}</span>
                </div>
              ))}
            </div>
          </div>
        </details>

        {updatedTs != null && (
          <div className="mt-3.5 flex items-center gap-1.5 text-[11.5px] text-faint">
            <svg
              width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" />
            </svg>
            Last updated: {timeAgo(updatedTs)}
          </div>
        )}
      </div>
    </section>
  );
}
