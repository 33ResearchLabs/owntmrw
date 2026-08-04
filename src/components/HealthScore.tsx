import type { HealthScore as HS } from "@/lib/analytics";
import { scoreColor } from "@/lib/analytics";

/** Radial gauge for the composite score. */
function Gauge({ score }: { score: number | null }) {
  const r = 42, c = 2 * Math.PI * r;
  const pct = score == null ? 0 : score / 100;
  return (
    <div className="relative shrink-0" style={{ width: 108, height: 108 }}>
      <svg width="108" height="108" viewBox="0 0 108 108" className="-rotate-90">
        <circle cx="54" cy="54" r={r} fill="none" stroke="var(--grid)" strokeWidth="8" />
        {score != null && (
          <circle
            cx="54" cy="54" r={r} fill="none"
            stroke={scoreColor(score)} strokeWidth="8" strokeLinecap="round"
            strokeDasharray={`${c * pct} ${c}`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="num text-[26px] font-semibold leading-none">{score ?? "—"}</span>
        <span className="text-[10px] uppercase tracking-[0.1em] text-muted">/ 100</span>
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
