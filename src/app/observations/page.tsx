import Link from "next/link";
import { allObservations } from "@/lib/queries";
import { timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function ObservationsPage() {
  const obs = allObservations(150);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Signals</h1>
        <p className="mt-1 text-[13px] text-ink2">
          Automatically generated observations — holder shifts, momentum, development spikes, concentration changes.
        </p>
      </div>
      <div className="card">
        <ul className="divide-y divide-grid">
          {obs.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-muted">
              No signals yet — run <code className="rounded bg-surface2 px-1.5 py-0.5">npm run ingest</code>.
            </li>
          )}
          {obs.map((o, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-3 px-4 py-2.5 text-[13px]">
              <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                {o.kind ?? "note"}
              </span>
              {o.slug && <Link href={`/project/${o.slug}`} className="shrink-0 font-medium hover:text-accent">{o.name}</Link>}
              <span className="min-w-0 text-ink2">{o.text}</span>
              <span className="num ml-auto shrink-0 text-[11px] text-muted">{timeAgo(o.ts)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
