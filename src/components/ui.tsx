import { fmtPct } from "@/lib/format";

export function Delta({ v }: { v: number | null | undefined }) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted">—</span>;
  const cls = v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink2";
  const arrow = v > 0 ? "▲" : v < 0 ? "▼" : "";
  return (
    <span className={`num ${cls}`}>
      {arrow && <span className="mr-0.5 text-[9px] align-[1px]">{arrow}</span>}
      {fmtPct(v, false)}
    </span>
  );
}

export function Logo({ src, name, size = 28 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src} alt="" width={size} height={size}
        className="rounded-full bg-surface2 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="flex items-center justify-center rounded-full bg-surface2 text-[11px] font-semibold text-ink2"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="num mt-1 text-[19px] font-semibold leading-tight">{value}</div>
      {sub != null && <div className="mt-0.5 text-[12px] text-ink2">{sub}</div>}
    </div>
  );
}

export function StatusBadge({ status }: { status: string | null }) {
  const s = (status ?? "unknown").toLowerCase();
  const map: Record<string, string> = {
    live: "text-good border-good/40",
    raising: "text-accent border-accent/40",
    completed: "text-ink2 border-line",
    failed: "text-bad border-bad/40",
  };
  return (
    <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${map[s] ?? "text-muted border-line"}`}>
      {s}
    </span>
  );
}
