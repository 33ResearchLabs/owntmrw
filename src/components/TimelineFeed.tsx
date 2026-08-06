"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Icon, type IconName } from "./viz";
import { Logo } from "./ui";

/**
 * One event, with its date and time already formatted.
 *
 * Formatting happens on the server so both renders agree: `toLocaleTimeString`
 * reads the host timezone, and letting the client format would make every row a
 * hydration mismatch on any machine not set to the server's zone.
 */
export interface TimelineEventDTO {
  ts: number;
  type: string;
  title: string;
  url: string | null;
  slug: string;
  name: string;
  image_url: string | null;
  /** e.g. "Aug 5, 2026" — also the grouping key. */
  dateLabel: string;
  /** e.g. "10:24 AM". */
  timeLabel: string;
}

/**
 * Per-type identity: accent, label and glyph.
 *
 * Decorative only — it marks which family a row belongs to and never encodes a
 * value, so these colours are free of the rules the charts follow. Types absent
 * from this map fall back to the neutral entry rather than going unstyled.
 */
const TYPE_STYLE: Record<string, { label: string; color: string; icon: IconName }> = {
  news: { label: "News", color: "#9085e9", icon: "info" },
  token_launch: { label: "Token Launch", color: "#3987e5", icon: "target" },
  raise_closed: { label: "Raise Closed", color: "#0ca30c", icon: "bank" },
  github_release: { label: "Github Release", color: "#d95926", icon: "layers" },
  proposal: { label: "Governance", color: "#199e70", icon: "shield" },
  listing: { label: "Listing", color: "#c98500", icon: "chart" },
  partnership: { label: "Partnership", color: "#d55181", icon: "users" },
};

const NEUTRAL = { color: "var(--ink-muted)", icon: "info" as IconName };

function styleOf(type: string) {
  return TYPE_STYLE[type] ?? {
    ...NEUTRAL,
    label: type.replace(/_/g, " "),
  };
}

/** Small tinted pill naming the event family. */
function TypeBadge({ type }: { type: string }) {
  const s = styleOf(type);
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

export function TimelineFeed({ events }: { events: TimelineEventDTO[] }) {
  const [filter, setFilter] = useState<string>("all");

  /** Only families actually present get a chip — an empty filter is a dead end. */
  const presentTypes = useMemo(
    () => Array.from(new Set(events.map((e) => e.type))),
    [events]
  );

  // Filter first, then group: grouping the filtered list keeps the newest-first
  // order the query returned, and a date with nothing left simply disappears.
  const groups = useMemo(() => {
    const shown = filter === "all" ? events : events.filter((e) => e.type === filter);
    const byDate = new Map<string, TimelineEventDTO[]>();
    for (const e of shown) {
      const bucket = byDate.get(e.dateLabel);
      if (bucket) bucket.push(e);
      else byDate.set(e.dateLabel, [e]);
    }
    return Array.from(byDate, ([date, items]) => ({ date, items }));
  }, [events, filter]);

  return (
    <div className="space-y-5">
      {/* Filter bar. Scrolls rather than wraps on a phone, so the row keeps its
          shape and the chips stay one line however many families exist. */}
      <div className="scroll-x-quiet -mx-1 px-1">
        <div className="flex w-max items-center gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All Events
          </FilterChip>
          {presentTypes.map((t) => (
            <FilterChip key={t} active={filter === t} onClick={() => setFilter(t)}>
              {styleOf(t).label}
            </FilterChip>
          ))}
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="card px-4 py-8 text-center text-[13px] text-muted">
          Nothing indexed yet — run{" "}
          <code className="rounded bg-surface2 px-1.5 py-0.5">npm run ingest</code>.
        </div>
      ) : (
        <div className="relative">
          {/* The rail. Sits behind the date markers and stops short of the last
              group so the line does not trail past the final event. */}
          <span
            aria-hidden
            className="absolute left-[13px] top-2 bottom-6 w-px bg-line2 sm:left-[15px]"
          />

          <div className="space-y-6">
            {groups.map((g) => {
              const accent = styleOf(g.items[0].type).color;
              const icon = styleOf(g.items[0].type).icon;
              return (
                <section key={g.date} className="relative pl-9 sm:pl-11">
                  {/* Date marker, tinted by the family that opens the day. */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 flex h-[27px] w-[27px] items-center justify-center rounded-full
                               border bg-page sm:h-[31px] sm:w-[31px]"
                    style={{
                      borderColor: `color-mix(in srgb, ${accent} 45%, transparent)`,
                      color: accent,
                      boxShadow: `0 0 14px -4px ${accent}`,
                    }}
                  >
                    <Icon name={icon} size={13} />
                  </span>

                  <h2 className="pt-1.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
                    {g.date}
                  </h2>

                  <div className="mt-2.5 overflow-hidden rounded-2xl border border-line bg-surface2/40 shadow-sm shadow-black/20">
                    <ul className="divide-y divide-grid">
                      {g.items.map((e, i) => (
                        <li
                          key={`${e.slug}-${e.ts}-${i}`}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5 text-[13px]
                                     transition-colors hover:bg-white/[0.03] sm:flex-nowrap sm:px-4"
                        >
                          <span className="num w-[62px] shrink-0 text-[11.5px] text-faint">
                            {e.timeLabel}
                          </span>

                          <Link
                            href={`/project/${e.slug}`}
                            className="flex shrink-0 items-center gap-2 font-medium text-ink hover:text-accent"
                          >
                            <Logo src={e.image_url} name={e.name} size={20} />
                            {e.name}
                          </Link>

                          <TypeBadge type={e.type} />

                          <span className="min-w-0 basis-full text-ink2 sm:basis-auto">
                            {e.url ? (
                              <a
                                href={e.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="hover:text-accent"
                              >
                                {e.title}
                              </a>
                            ) : (
                              e.title
                            )}
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

function FilterChip({
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
