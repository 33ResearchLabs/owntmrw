import Link from "next/link";
import { globalTimeline } from "@/lib/queries";
import { fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default function TimelinePage() {
  const events = globalTimeline(200);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight">Ecosystem Timeline</h1>
        <p className="mt-1 text-[13px] text-ink2">Every indexed event across all MetaDAO projects, newest first.</p>
      </div>
      <div className="card">
        <ul className="divide-y divide-grid">
          {events.length === 0 && (
            <li className="px-4 py-8 text-center text-[13px] text-muted">
              Nothing indexed yet — run <code className="rounded bg-surface2 px-1.5 py-0.5">npm run ingest</code>.
            </li>
          )}
          {events.map((e, i) => (
            <li key={i} className="flex flex-wrap items-baseline gap-3 px-4 py-2.5 text-[13px]">
              <span className="num w-24 shrink-0 text-muted">{fmtDate(e.ts)}</span>
              <Link href={`/project/${e.slug}`} className="shrink-0 font-medium hover:text-accent">{e.name}</Link>
              <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink2">
                {e.type.replace(/_/g, " ")}
              </span>
              <span className="min-w-0 text-ink2">
                {e.url
                  ? <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{e.title}</a>
                  : e.title}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
