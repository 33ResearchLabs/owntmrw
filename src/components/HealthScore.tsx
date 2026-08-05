import type { HealthScore as HS } from "@/lib/analytics";
import { scoreColor } from "@/lib/analytics";

/**
 * The bands the needle points into. Thresholds are `scoreColor`'s own, so the
 * arc a needle lands on is always the colour that function would return —
 * the dial cannot disagree with the number printed inside it.
 */
const BANDS = [
  { from: 0, to: 30, color: "var(--bad)", label: "Weak" },
  { from: 30, to: 50, color: "var(--serious)", label: "Fragile" },
  { from: 50, to: 75, color: "var(--warn)", label: "Mixed" },
  { from: 75, to: 100, color: "var(--good)", label: "Strong" },
];

const CX = 100, CY = 96, R = 76;

/** Score → point on the dial. 0 is due west, 100 due east. */
function polar(score: number, radius: number) {
  const rad = (Math.PI * (180 - (score / 100) * 180)) / 180;
  return { x: CX + radius * Math.cos(rad), y: CY - radius * Math.sin(rad) };
}

function arc(from: number, to: number) {
  const a = polar(from, R), b = polar(to, R);
  return `M ${a.x} ${a.y} A ${R} ${R} 0 0 1 ${b.x} ${b.y}`;
}

/**
 * Semicircular gauge for the composite score.
 *
 * All four bands are on screen at once, and two of them (Mixed and Fragile) are
 * close enough in hue that a reader cannot reliably name them side by side. So
 * the inactive bands are dimmed to read as a background scale and the band the
 * needle is in is stated in words underneath — colour ranks the bands, it never
 * has to identify them.
 */
function Gauge({ score }: { score: number | null }) {
  const band = score == null ? null : BANDS.find((b) => score < b.to) ?? BANDS[BANDS.length - 1];
  const needle = polar(score ?? 0, R - 16);

  return (
    // The readout sits below the dial, not inside it: the needle sweeps the
    // whole semicircle, so any text in there is crossed out at some scores.
    <div className="flex shrink-0 flex-col items-center" style={{ width: 200 }}>
      <svg width="200" height="108" viewBox="0 0 200 108">
        {BANDS.map((b) => (
          <path
            key={b.from}
            // A 0.6 gap either side is the 2px surface separator at this radius.
            d={arc(b.from + (b.from === 0 ? 0 : 0.6), b.to - (b.to === 100 ? 0 : 0.6))}
            fill="none"
            stroke={b.color}
            strokeWidth="11"
            opacity={band === b ? 1 : 0.22}
          />
        ))}
        {score != null && (
          <>
            <line
              x1={CX} y1={CY} x2={needle.x} y2={needle.y}
              stroke="var(--ink)" strokeWidth="2.5" strokeLinecap="round"
            />
            <circle cx={CX} cy={CY} r="5" fill="var(--ink)" />
            <circle cx={CX} cy={CY} r="2" fill="var(--surface)" />
          </>
        )}
      </svg>

      <div className="mt-1 flex flex-col items-center">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[30px] font-semibold leading-none">{score ?? "—"}</span>
          <span className="text-[11px] text-faint">/ 100</span>
        </div>
        <span className="mt-1 text-[11px] font-medium" style={{ color: band?.color }}>
          {band?.label ?? "Not scored"}
        </span>
      </div>
    </div>
  );
}

export function HealthScorePanel({ hs }: { hs: HS }) {
  return (
    <section className="card">
      <div className="flex items-baseline justify-between border-b border-grid px-4 py-3">
        <h2 className="text-[14px] font-semibold">Project Health Score</h2>
        <span className="text-[11px] text-muted">
          {hs.measured} of {hs.total} dimensions measurable
        </span>
      </div>
      <div className="flex flex-col gap-5 px-4 py-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <Gauge score={hs.overall} />
          <div className="sm:hidden">
            <div className="text-[12px] text-ink2">Composite across measured dimensions</div>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {hs.components.map((c) => (
            <div key={c.key} className="flex items-center gap-3">
              <span className="w-[112px] shrink-0 text-[12px] text-ink2">{c.label}</span>
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grid">
                {c.score != null && (
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${c.score}%`, background: scoreColor(c.score) }}
                  />
                )}
              </div>
              <span className="num w-8 shrink-0 text-right text-[12px] font-medium">
                {c.score ?? <span className="text-muted">—</span>}
              </span>
              <span className="hidden w-[190px] shrink-0 truncate text-[11px] text-muted md:block" title={c.detail}>
                {c.detail}
              </span>
            </div>
          ))}
        </div>
      </div>
      {hs.measured < hs.total && (
        <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
          Unmeasurable dimensions are excluded from the composite rather than scored as zero,
          so the headline number reflects only what public sources can verify.
        </p>
      )}
    </section>
  );
}
