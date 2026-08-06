"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "./viz";
import { Logo } from "./ui";

/**
 * One signal, with its stamps already formatted.
 *
 * Formatting happens on the server so both renders agree — `toLocaleTimeString`
 * and `timeAgo` both read the host clock, and formatting client-side would make
 * every row a hydration mismatch on a machine in another timezone.
 */
export interface SignalDTO {
  ts: number;
  kind: string | null;
  text: string;
  slug: string | null;
  name: string | null;
  image_url: string | null;
  /** e.g. "Aug 5, 2026" — also the grouping key. */
  dateLabel: string;
  /** e.g. "10:24 AM". */
  timeLabel: string;
  /** e.g. "2m ago". */
  agoLabel: string;
}

/**
 * Per-kind identity: label, accent and glyph.
 *
 * Decorative only — it marks which family a signal belongs to and never encodes
 * a value. Kinds absent from this map fall back to a neutral entry with their
 * raw name, so a new kind from the ingest renders sensibly without a code change.
 */
const KIND_STYLE: Record<string, { label: string; color: string; icon: IconName }> = {
  momentum: { label: "Momentum", color: "#199e70", icon: "chart" },
  price: { label: "Price", color: "#fab219", icon: "percent" },
  github: { label: "Development", color: "#d95926", icon: "layers" },
  risk: { label: "Risk", color: "#d03b3b", icon: "shield" },
  onchain: { label: "On-chain", color: "#3987e5", icon: "token" },
  holders: { label: "Holders", color: "#9085e9", icon: "users" },
};

function styleOf(kind: string | null) {
  const key = kind ?? "note";
  return KIND_STYLE[key] ?? {
    label: key.replace(/_/g, " "),
    color: "var(--ink-muted)",
    icon: "info" as IconName,
  };
}

/** Soft pill naming the signal family. */
function KindBadge({ kind }: { kind: string | null }) {
  const s = styleOf(kind);
  return (
    <span
      className="shrink-0 rounded-md px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[0.07em]
                 transition-opacity hover:opacity-80"
      style={{ color: s.color, background: `color-mix(in srgb, ${s.color} 16%, transparent)` }}
    >
      {s.label}
    </span>
  );
}

/** Summary tile. `sub` carries the share of the total, or the window. */
function SummaryCard({
  label, value, sub, color, icon,
}: {
  label: string; value: string; sub: string; color: string; icon: IconName;
}) {
  return (
    <div
      className="group rounded-2xl border border-line bg-surface2/40 px-4 py-3.5 shadow-sm shadow-black/20
                 transition-colors hover:border-line2 hover:bg-surface2/70"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[11px] text-muted">{label}</div>
          <div className="num mt-1.5 text-[22px] font-extrabold leading-none tracking-tight text-ink">
            {value}
          </div>
        </div>
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}
        >
          <Icon name={icon} size={14} />
        </span>
      </div>
      <div className="mt-1.5 truncate text-[10.5px] text-faint">{sub}</div>
    </div>
  );
}

export function SignalsFeed({
  signals, todayLabel,
}: {
  signals: SignalDTO[];
  /** Today's date in the same format as `dateLabel`, for the "Today" heading. */
  todayLabel: string;
}) {
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [newestFirst, setNewestFirst] = useState(true);

  /** Only families actually present get a chip — an empty filter is a dead end. */
  const presentKinds = useMemo(() => {
    const seen = new Map<string, number>();
    for (const s of signals) {
      const k = s.kind ?? "note";
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
    return Array.from(seen, ([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
  }, [signals]);

  const projects = useMemo(
    () => Array.from(new Set(signals.map((s) => s.name).filter((n): n is string => !!n))).sort(),
    [signals]
  );

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = signals.filter((s) => {
      if (kindFilter !== "all" && (s.kind ?? "note") !== kindFilter) return false;
      if (projectFilter !== "all" && s.name !== projectFilter) return false;
      if (q && !s.text.toLowerCase().includes(q) && !(s.name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
    // The query already returns newest first; oldest is that list reversed.
    return newestFirst ? list : [...list].reverse();
  }, [signals, kindFilter, projectFilter, query, newestFirst]);

  // Group after filtering, so a date with nothing left simply disappears and the
  // order the list arrived in is preserved within every group.
  const groups = useMemo(() => {
    const byDate = new Map<string, SignalDTO[]>();
    for (const s of shown) {
      const bucket = byDate.get(s.dateLabel);
      if (bucket) bucket.push(s);
      else byDate.set(s.dateLabel, [s]);
    }
    return Array.from(byDate, ([date, items]) => ({ date, items }));
  }, [shown]);

  return (
    <div className="space-y-5">
      {/* Summary. One card per family actually present, plus the total — a
          "Risk 0" tile for a family the ingest never emits is noise, not data. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label="Total Signals"
          value={String(signals.length)}
          sub="Across all indexed projects"
          color="#3987e5"
          icon="bars"
        />
        {presentKinds.map(({ kind, count }) => {
          const s = styleOf(kind);
          const pct = signals.length ? ((count / signals.length) * 100).toFixed(1) : "0.0";
          return (
            <SummaryCard
              key={kind}
              label={s.label}
              value={String(count)}
              sub={`${pct}% of total`}
              color={s.color}
              icon={s.icon}
            />
          );
        })}
      </div>

      {/* Toolbar. Chips scroll rather than wrap so the row keeps its shape. */}
      <div className="rounded-2xl border border-line bg-surface2/30 p-2.5">
        <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
          <div className="scroll-x-quiet -mx-0.5 min-w-0 px-0.5">
            <div className="flex w-max items-center gap-1.5">
              <Chip active={kindFilter === "all"} onClick={() => setKindFilter("all")}>
                All Signals
              </Chip>
              {presentKinds.map(({ kind }) => (
                <Chip key={kind} active={kindFilter === kind} onClick={() => setKindFilter(kind)}>
                  {styleOf(kind).label}
                </Chip>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label="Filter by project"
              className="h-8 rounded-lg border border-line bg-surface2/60 px-2 text-[12px] text-ink2
                         transition-colors hover:border-line2 focus:outline-none"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <button
              type="button"
              disabled
              title="Advanced filters — not available yet"
              className="flex h-8 cursor-not-allowed items-center gap-1.5 rounded-lg border border-line px-2.5
                         text-[12px] text-faint opacity-50"
            >
              Filters
            </button>
          </div>
        </div>

        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-line pt-2.5 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative flex min-w-0 flex-1 items-center sm:max-w-[280px]">
            <span className="pointer-events-none absolute left-2.5 text-muted">
              <Icon name="target" size={13} />
            </span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search signals..."
              aria-label="Search signals"
              className="h-8 w-full rounded-lg border border-line bg-surface2/60 pl-8 pr-2.5 text-[12px] text-ink
                         placeholder:text-faint transition-colors hover:border-line2
                         focus:border-line2 focus:outline-none"
            />
          </label>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled
              title="Signals carry no importance rating yet"
              className="flex cursor-not-allowed items-center gap-1.5 text-[12px] text-faint opacity-50"
            >
              <span className="h-4 w-7 rounded-full border border-line bg-surface2" />
              Only important
            </button>
            <select
              value={newestFirst ? "new" : "old"}
              onChange={(e) => setNewestFirst(e.target.value === "new")}
              aria-label="Sort order"
              className="h-8 rounded-lg border border-line bg-surface2/60 px-2 text-[12px] text-ink2
                         transition-colors hover:border-line2 focus:outline-none"
            >
              <option value="new">Newest first</option>
              <option value="old">Oldest first</option>
            </select>
          </div>
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card px-4 py-8 text-center text-[13px] text-muted">
          {signals.length === 0 ? (
            <>No signals yet — run <code className="rounded bg-surface2 px-1.5 py-0.5">npm run ingest</code>.</>
          ) : (
            "No signals match these filters."
          )}
        </div>
      ) : (
        <div className="relative">
          <span
            aria-hidden
            className="absolute left-[13px] top-2 bottom-6 w-px bg-line2 sm:left-[15px]"
          />

          <div className="space-y-6">
            {groups.map((g) => {
              const lead = styleOf(g.items[0].kind);
              return (
                <section key={g.date} className="relative pl-9 sm:pl-11">
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 flex h-[27px] w-[27px] items-center justify-center rounded-full
                               border bg-page sm:h-[31px] sm:w-[31px]"
                    style={{
                      borderColor: `color-mix(in srgb, ${lead.color} 45%, transparent)`,
                      color: lead.color,
                      boxShadow: `0 0 14px -4px ${lead.color}`,
                    }}
                  >
                    <Icon name={lead.icon} size={13} />
                  </span>

                  <h2 className="pt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {g.date === todayLabel ? "Today" : g.date}
                  </h2>

                  <div className="mt-2.5 overflow-hidden rounded-2xl border border-line bg-surface2/40 shadow-sm shadow-black/20">
                    <ul className="divide-y divide-grid">
                      {g.items.map((s, i) => (
                        <li
                          key={`${s.slug ?? "global"}-${s.ts}-${i}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-[13px]
                                     transition-colors hover:bg-white/[0.03] sm:flex-nowrap sm:px-4"
                        >
                          <span className="num w-[62px] shrink-0 text-[11.5px] text-faint">
                            {s.timeLabel}
                          </span>

                          {s.slug && s.name ? (
                            <Link
                              href={`/project/${s.slug}`}
                              className="flex shrink-0 items-center gap-2 font-medium text-ink hover:text-accent"
                            >
                              <Logo src={s.image_url} name={s.name} size={20} />
                              {s.name}
                            </Link>
                          ) : (
                            <span className="shrink-0 font-medium text-muted">Ecosystem</span>
                          )}

                          <KindBadge kind={s.kind} />

                          <span className="min-w-0 basis-full text-ink2 sm:basis-auto">{s.text}</span>

                          <span className="num ml-auto shrink-0 text-[11px] text-faint">
                            {s.agoLabel}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({
  active, onClick, children,
}: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`shrink-0 rounded-lg px-3 py-1.5 text-[12px] leading-none transition-colors ${
        active
          ? "bg-white/10 font-medium text-ink"
          : "text-muted hover:bg-white/5 hover:text-ink2"
      }`}
    >
      {children}
    </button>
  );
}
