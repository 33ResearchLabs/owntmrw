"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Delta, Logo } from "./ui";
import { TrendSectionHeader } from "./viz";
import { fmtUsd, fmtNum, fmtPrice } from "@/lib/format";

/**
 * One row of the home page's explorer table. Flattened from `ExplorerRow` at
 * the server boundary rather than passed whole — the full screener row carries
 * thirty-odd fields this table never reads, and every one of them would be
 * serialised into the page for the client bundle to parse.
 */
export interface ExplorerRowDTO {
  slug: string;
  name: string;
  symbol: string | null;
  image_url: string | null;
  category: string | null;
  price_usd: number | null;
  vol7d: number | null; vol7dTrend: number | null;
  vol30d: number | null; vol30dTrend: number | null;
  vol180d: number | null; vol180dTrend: number | null;
  mcap: number | null;
  liquidity_usd: number | null;
  treasury_usd: number | null;
  holder_count: number | null;
  /** Days of candle history, for marking windows longer than the data. */
  candleDays: number;
  /** Trend keys whose figure came from splitting the window. */
  partial: Partial<Record<TrendKey, boolean>>;
  /** Days each trend actually spans. */
  trendDays: Partial<Record<TrendKey, number>>;
}

type TrendKey = "vol7dTrend" | "vol30dTrend" | "vol180dTrend";

type SortKey = Exclude<keyof ExplorerRowDTO, "slug" | "image_url" | "candleDays" | "partial" | "trendDays">;

/**
 * A column, and the window it covers where that matters.
 *
 * `window` is what makes a figure markable: a 180-day column on a project with
 * forty days of candles is arithmetic over forty days, and the cell says so
 * rather than sitting beside a full-history row looking like its equal.
 */
interface Col {
  key: SortKey;
  label: string;
  /** Second line of the header, e.g. the window a volume column covers. */
  unit?: string;
  align?: "right";
  window?: number;
  kind: "text" | "usd" | "price" | "num" | "delta";
}

const COLS: Col[] = [
  { key: "name", label: "Project", kind: "text" },
  { key: "category", label: "Market sector", kind: "text" },
  { key: "price_usd", label: "Price", align: "right", kind: "price" },
  { key: "vol7d", label: "Volume", unit: "7d", align: "right", window: 7, kind: "usd" },
  { key: "vol30d", label: "Volume", unit: "30d", align: "right", window: 30, kind: "usd" },
  { key: "vol180d", label: "Volume", unit: "180d", align: "right", window: 180, kind: "usd" },
  { key: "vol7dTrend", label: "Vol Trend", unit: "7d", align: "right", kind: "delta" },
  { key: "vol30dTrend", label: "Vol Trend", unit: "30d", align: "right", kind: "delta" },
  { key: "vol180dTrend", label: "Vol Trend", unit: "180d", align: "right", kind: "delta" },
  { key: "mcap", label: "Market cap", align: "right", kind: "usd" },
  { key: "liquidity_usd", label: "Liquidity", align: "right", kind: "usd" },
  { key: "treasury_usd", label: "Treasury", align: "right", kind: "usd" },
  { key: "holder_count", label: "Holders", align: "right", kind: "num" },
];

/** Rows shown before the fade. The rest are a click away on the screener. */
const VISIBLE = 8;

/**
 * Why a windowed figure is marked. Same `~` the screener already uses for a
 * number whose method cannot bear the weight the column implies.
 */
function shortWindow(r: ExplorerRowDTO, c: Col): string | undefined {
  if (c.kind === "delta") {
    if (!r.partial[c.key as TrendKey]) return undefined;
    const d = r.trendDays[c.key as TrendKey] ?? 0;
    return `No prior ${c.unit} period on file to compare against, so this is the later half of the last ${d} days against the earlier half.`;
  }
  if (!c.window || !r.candleDays || r.candleDays >= c.window) return undefined;
  return `Only ${r.candleDays} day${r.candleDays === 1 ? "" : "s"} of candle history on file — this ${c.window}-day window covers ${r.candleDays}.`;
}

export function ExplorerTable({ rows }: { rows: ExplorerRowDTO[] }) {
  const [sort, setSort] = useState<SortKey>("vol30d");
  const [dir, setDir] = useState<1 | -1>(-1);

  const sorted = useMemo(
    () =>
      [...rows].sort((a, b) => {
        const av = a[sort], bv = b[sort];
        // Nulls sort last in both directions — a project with no reading is
        // not "the smallest", and floating it to the top on an ascending sort
        // would bury every project that actually has one.
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === "string") return dir * av.localeCompare(String(bv));
        return dir * ((av as number) - (bv as number));
      }),
    [rows, sort, dir]
  );

  const shown = sorted.slice(0, VISIBLE);

  const th = (c: Col) => {
    const on = sort === c.key;
    return (
      <th
        key={c.key}
        aria-sort={on ? (dir === -1 ? "descending" : "ascending") : "none"}
        className={`cursor-pointer select-none align-bottom hover:text-ink2 ${c.align === "right" ? "!text-right" : ""}`}
        onClick={() => {
          if (on) setDir((d) => (d === 1 ? -1 : 1));
          // Text columns read A→Z first; every measure reads biggest first.
          else { setSort(c.key); setDir(c.kind === "text" ? 1 : -1); }
        }}
      >
        <span className="block leading-tight">{c.label}</span>
        <span className="flex items-center gap-1 leading-tight text-faint"
          style={{ justifyContent: c.align === "right" ? "flex-end" : "flex-start" }}>
          {c.unit}
          <span className={on ? "text-brand" : "opacity-40"}>{on ? (dir === -1 ? "↓" : "↑") : "⇅"}</span>
        </span>
      </th>
    );
  };

  const cell = (r: ExplorerRowDTO, c: Col) => {
    const v = r[c.key];
    const mark = shortWindow(r, c);
    if (c.kind === "delta") {
      // A split-window trend is real but spans less than the column promises,
      // so it wears the same `~` the volume columns use for the same reason.
      const part = r.partial[c.key as TrendKey];
      return (
        <>
          {part && v != null && <span className="text-faint">~</span>}
          <Delta v={v as number | null} />
        </>
      );
    }
    // Prices go through `fmtPrice`, not `fmtUsd`: most of these quotes sit
    // below a dollar, where two decimals collapses $0.00180 and $0.00225 onto
    // the same "$0.00" — three significant figures keeps the column readable
    // as a comparison rather than a row of zeroes.
    if (c.kind === "price") return fmtPrice(v as number | null);
    if (c.kind === "num") return fmtNum(v as number | null);
    return (
      <>
        {mark && v != null && <span className="text-faint">~</span>}
        {fmtUsd(v as number | null)}
      </>
    );
  };

  return (
    <section>
      {/* Section heading, outside the card and matching Top Movers above it —
          same size, weight and `mb-4` gap, so the two read as siblings on the
          page rather than one being a tag and the other a heading. */}
      <h2 className="mb-4 text-[18px] font-bold">Market Explorer</h2>

      <div className="card relative overflow-hidden">
        {/* Title and subtitle stay inside the container, like the Treasury and
            Development sections. Only the eyebrow moved out: dropping it also
            drops the dot, since `TrendSectionHeader` renders the pair or
            neither, which is why `color` goes with it. */}
        <div className="px-5 pt-5 sm:px-6">
          <TrendSectionHeader
            title="The most powerful explorer in crypto."
            subtitle="Ranked by traded volume, market cap, pool depth, treasury and holders. Sort any column."
          />

        </div>
        <div className="scroll-x border-t border-grid">
          <table className="itable text-[13px]">
            <thead><tr>{COLS.map(th)}</tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.slug}>
                  <td>
                    <div className="flex items-center gap-3">
                      {/* Rank follows the sort, so it reads as a position in the
                          current ranking rather than a fixed project number. */}
                      <span className="num w-4 shrink-0 text-right text-[12px] text-faint">{i + 1}</span>
                      <Link href={`/project/${r.slug}`} className="flex items-center gap-2.5 hover:text-brand">
                        <Logo src={r.image_url} name={r.name} size={22} />
                        <span className="max-w-[150px] truncate font-medium">{r.name}</span>
                        {r.symbol && (
                          <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                            {r.symbol}
                          </span>
                        )}
                      </Link>
                    </div>
                  </td>
                  {COLS.slice(1).map((c) => (
                    <td
                      key={c.key}
                      title={shortWindow(r, c)}
                      className={`${c.kind === "text" ? "max-w-[170px] truncate text-ink2" : "num"} ${
                        c.align === "right" ? "text-right" : ""
                      }`}
                    >
                      {c.kind === "text"
                        ? (r[c.key] as string | null) ?? <span className="text-muted">—</span>
                        : cell(r, c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* The reference design fades the table into the page rather than ending
            it on a hard rule. It stays purely decorative and click-through:
            the rows it fades over are still readable, and every project in them
            links to its own page from the first column. */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28"
          style={{ background: "linear-gradient(to top, var(--surface) 22%, transparent)" }}
          aria-hidden
        />
        <div className="relative px-4 py-3">
          <span className="text-[11.5px] text-faint">
            Volume summed from daily candles · {rows.length} projects tracked
          </span>
        </div>
      </div>
    </section>
  );
}
