import Link from "next/link";
import { fmtPct } from "@/lib/format";

/**
 * A signed percentage, coloured by direction.
 *
 * `notation` picks how the direction is written, not what it is: "arrow" is the
 * dense table form (a 9px glyph reads as a tick beside 12px text), "sign" is the
 * form that holds up at display sizes, where a triangle that small next to a
 * 26px number just looks like grit. Same number either way.
 */
export function Delta({
  v,
  notation = "arrow",
}: {
  v: number | null | undefined;
  notation?: "arrow" | "sign";
}) {
  if (v == null || !Number.isFinite(v)) return <span className="text-muted">—</span>;
  const cls = v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink2";
  if (notation === "sign") return <span className={`num ${cls}`}>{fmtPct(v)}</span>;
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

export interface BarItem {
  key: string;
  label: React.ReactNode;
  /** Drives bar length. Bars scale to the largest item, not to a fixed ceiling. */
  value: number;
  /** The value as the reader should see it — the bar never has to be measured. */
  display: string;
  /** Renders in the de-emphasis grey: present in the data, but not the subject. */
  muted?: boolean;
  title?: string;
  href?: string;
}

/**
 * A ranked horizontal bar list.
 *
 * Bars scale to the largest item because these distributions are long-tailed —
 * against a fixed 0-100 the tail is a row of invisible slivers. The value gets
 * its own aligned column rather than a tip label, so the longest bar cannot
 * push its number off the card edge and the numbers read as a column.
 */
export function BarList({ items, labelWidth = 150 }: { items: BarItem[]; labelWidth?: number }) {
  const max = Math.max(...items.map((i) => i.value), 0);
  if (!items.length || max <= 0) return null;

  return (
    <div className="space-y-1.5 px-4 py-4">
      {items.map((i) => (
        <div key={i.key} className="flex items-center gap-3">
          <span
            className="num shrink-0 truncate text-[12px] text-ink2"
            style={{ width: labelWidth }}
            title={i.title}
          >
            {i.href ? (
              <Link href={i.href} className="hover:text-accent">{i.label}</Link>
            ) : (
              i.label
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="h-2.5 rounded-r-sm"
              style={{
                width: `${Math.max(1, (i.value / max) * 100)}%`,
                background: i.muted ? "var(--series-none)" : "var(--accent)",
              }}
            />
          </div>
          <span className="num w-14 shrink-0 text-right text-[12px] font-medium">
            {i.display}
          </span>
        </div>
      ))}
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
