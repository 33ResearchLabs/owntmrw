"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Delta, Logo, StatusBadge } from "./ui";
import { Icon, type IconName } from "./viz";
import { fmtUsd, fmtPrice, fmtNum, fmtPct, timeAgo } from "@/lib/format";
import { MIN_LIQUIDITY_USD } from "@/lib/quote";
import { scoreColor } from "@/lib/analytics";
import { WatchButton } from "./WatchButton";
import {
  applyScreenerQuery,
  DEFAULT_QUERY,
  formatAmount,
  isDefaultQuery,
  parseAmount,
  parseScreenerQuery,
  serializeScreenerQuery,
  type ScreenerQuery,
  type ScreenerRowDTO,
  type SortKey,
} from "@/lib/screener";

export type { ScreenerRowDTO } from "@/lib/screener";

/** The subset `/api/live` refreshes; everything else is archival. */
type LivePatch = Pick<
  ScreenerRowDTO,
  | "price_usd" | "mcap" | "fdv" | "liquidity_usd" | "vol24h" | "change_24h"
  | "roi_since_raise" | "ath_return" | "from_ath" | "returns_thin"
> & { slug: string };

const POLL_MS = 30_000;

/**
 * Re-quote the table in place. The server already rendered live prices, so this
 * only keeps a terminal left open from going stale — a failed poll holds the
 * last good quotes rather than blanking the table.
 */
function useLiveRows(initial: ScreenerRowDTO[]): { rows: ScreenerRowDTO[]; stale: boolean } {
  const [patches, setPatches] = useState<Map<string, LivePatch> | null>(null);
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { rows: LivePatch[] };
        if (cancelled) return;
        setPatches(new Map(data.rows.map((r) => [r.slug, r])));
        setStale(false);
      } catch {
        if (!cancelled) setStale(true);
      }
    };
    const id = setInterval(poll, POLL_MS);
    // A backgrounded tab throttles timers, so re-quote the moment it returns.
    const onFocus = () => poll();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const rows = useMemo(
    () => (patches ? initial.map((r) => ({ ...r, ...(patches.get(r.slug) ?? {}) })) : initial),
    [initial, patches]
  );
  return { rows, stale };
}

/**
 * Summary tile for the screener header.
 *
 * The icon is identity, not data — it marks which figure the tile carries so
 * the four read as a set at a glance, and never encodes a value.
 */
function Stat({ label, value, icon }: { label: string; value: string; icon: IconName }) {
  return (
    <div
      className="group rounded-2xl border border-line bg-surface2/40 px-5 py-4 shadow-sm shadow-black/20
                 transition-colors hover:border-line2 hover:bg-surface2/70"
    >
      <div className="flex items-center gap-2 text-faint transition-colors group-hover:text-muted">
        <Icon name={icon} size={13} />
        <span className="text-[10.5px] uppercase tracking-[0.09em]">{label}</span>
      </div>
      {/* Indented onto the label's text edge rather than the card's, so the
          figure reads as belonging to the words above it and not to the icon.
          21px is the icon's own 13px box plus the row's gap-2 — the two values
          the label is already offset by, so the pair stays flush if either
          changes only by changing them here too. */}
      <div className="num mt-2.5 pl-[21px] text-[22px] font-extrabold leading-none tracking-tight text-ink">
        {value}
      </div>
    </div>
  );
}

/**
 * Why a return figure is marked. The pool size is named outright: "unreliable"
 * invites the reader to discount it by some unknown amount, whereas $33 of
 * depth tells them exactly how much weight it will bear.
 */
function thinTitle(r: ScreenerRowDTO): string | undefined {
  if (!r.returns_thin) return undefined;
  const depth = r.liquidity_usd == null ? "an unknown pool" : fmtUsd(r.liquidity_usd);
  return `Priced off ${depth} of liquidity — below the ${fmtUsd(MIN_LIQUIDITY_USD)} needed for a return figure to mean much.`;
}

/**
 * What to print where a raise figure will never arrive.
 *
 * A dash says "no data" and invites the reader to wait for a better ingest.
 * These four rows are not waiting on anything: Flash.Trade ran no sale, MetaDAO
 * raised privately, and Omnipair and Laso closed without publishing a settled
 * amount. Naming the reason in the cell is the difference between a terminal
 * that looks broken and one that has actually answered the question.
 */
const ABSENCE_LABEL: Record<string, { short: string; why: string }> = {
  no_ico: {
    short: "no ICO",
    why: "This token never ran a sale — supply was distributed by airdrop, so there is no raise to measure against.",
  },
  private_round: {
    short: "private",
    why: "Raised off-launchpad in a private round, which published no per-token price. Dividing the total by a token count it never sold would invent one.",
  },
  unpublished: {
    short: "unpublished",
    why: "The sale closed without publishing what it settled at, and the launch record does not store one. Only the committed total is known.",
  },
};

/** A cell that is empty for a reason, rendered as the reason. */
function Absent({ kind }: { kind: string }) {
  const a = ABSENCE_LABEL[kind];
  if (!a) return <>—</>;
  return <span className="text-faint italic" title={a.why}>{a.short}</span>;
}

const COLS: { key: SortKey; label: string; align?: "right"; title?: string }[] = [
  { key: "name", label: "Project" },
  { key: "status", label: "Status" },
  // The same composite the project page's header chip shows, computed by the
  // same function — so ranking the column ranks what the profiles say.
  {
    key: "health", label: "Health", align: "right",
    title: "Composite 0–100 across treasury, holder growth, distribution, liquidity, developer activity, governance and momentum. Dimensions with no data are left out, not scored as zero.",
  },
  { key: "price_usd", label: "Price", align: "right" },
  { key: "change_24h", label: "24h", align: "right" },
  // Archival close-to-close returns against the live price. Not re-quoted by
  // the 30s poll, which only carries what the venues report.
  { key: "ret_7d", label: "7d", align: "right", title: "Close-to-close return over 7 days, against the live price" },
  { key: "ret_30d", label: "30d", align: "right", title: "Close-to-close return over 30 days, against the live price" },
  { key: "mcap", label: "Mkt Cap", align: "right" },
  { key: "liquidity_usd", label: "Liquidity", align: "right" },
  { key: "vol24h", label: "Vol 24h", align: "right" },
  { key: "raise_amount_usd", label: "Raised", align: "right" },
  // Sits between the amount and the return because it is the baseline the
  // return is measured from — without it, ROI is a percentage of nothing visible.
  { key: "raise_price", label: "Raise Price", align: "right" },
  { key: "roi_since_raise", label: "ROI vs Raise", align: "right" },
  { key: "ath_return", label: "ATH Return", align: "right" },
  { key: "from_ath", label: "From ATH", align: "right" },
  { key: "treasury_usd", label: "Treasury", align: "right" },
  { key: "holder_count", label: "Holders", align: "right" },
  { key: "gh_stars", label: "GH ★", align: "right" },
  { key: "gh_last_push", label: "Last Commit", align: "right" },
];

/**
 * The view, kept in the address bar.
 *
 * State is seeded from the URL once, on mount, and every change is written
 * back with `history.replaceState` — which the App Router integrates with, so
 * `useSearchParams` stays in step without a server round trip. `router.replace`
 * would re-render this force-dynamic page (a fresh `screenerRows()` and quote
 * merge) on every keystroke; the rows are already here, only the view changes.
 * Writes are debounced so typing "meta" is one history entry, not four.
 *
 * The URL is not read back on every change on purpose: a re-derive racing a
 * debounced write would revert a character typed in between. The one time the
 * URL changes underneath us — back/forward — `popstate` re-seeds the view.
 */
function useScreenerQuery(): [ScreenerQuery, (patch: Partial<ScreenerQuery>) => void, () => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  // Seeded once; the effect below owns the URL from then on.
  const [query, setQuery] = useState<ScreenerQuery>(() => parseScreenerQuery(searchParams));

  useEffect(() => {
    const id = setTimeout(() => {
      const qs = serializeScreenerQuery(query);
      const next = qs ? `${pathname}?${qs}` : pathname;
      if (`${window.location.pathname}${window.location.search}` !== next) {
        window.history.replaceState(null, "", next);
      }
    }, 150);
    return () => clearTimeout(id);
  }, [query, pathname]);

  useEffect(() => {
    const onPop = () => setQuery(parseScreenerQuery(new URLSearchParams(window.location.search)));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const patch = (p: Partial<ScreenerQuery>) => setQuery((q) => ({ ...q, ...p }));
  const reset = () => setQuery(DEFAULT_QUERY);
  return [query, patch, reset];
}

/**
 * A USD floor as a text field. Local text so "5" on the way to "50k" is not
 * parsed as a $5 floor mid-keystroke; the view only takes the value once it
 * parses, and clearing the field clears the floor.
 */
function AmountInput({
  value, onChange, placeholder, label,
}: {
  value: number | null; onChange: (v: number | null) => void; placeholder: string; label: string;
}) {
  const [text, setText] = useState(() => formatAmount(value));
  // A change from outside (the Reset button, back/forward) is mirrored into
  // the text during render, the way React's docs adjust state on a prop change
  // — an effect would paint the stale field first and then repaint.
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    if (value == null) setText("");
    else if (parseAmount(text) !== value) setText(formatAmount(value));
  }
  return (
    <input
      value={text}
      onChange={(e) => {
        const t = e.target.value;
        setText(t);
        const parsed = parseAmount(t);
        if (t.trim() === "" || parsed != null) onChange(parsed);
      }}
      placeholder={placeholder}
      aria-label={label}
      inputMode="text"
      className="h-8 w-[104px] rounded-lg border border-line bg-surface2/60 px-2.5 text-[12px] text-ink
                 placeholder:text-faint transition-colors hover:border-line2 focus:border-line2 focus:outline-none"
    />
  );
}

/** The health figure, coloured by the same bands the project page dial uses. */
function HealthCell({ score, measured }: { score: number | null; measured: number }) {
  if (score == null) return <span className="text-muted" title="No dimension had enough data to score">—</span>;
  return (
    <span
      className="num font-semibold"
      style={{ color: scoreColor(score) }}
      title={`${measured} of 7 dimensions measurable`}
    >
      {score}
    </span>
  );
}

export function ScreenerTable({ rows: initialRows }: { rows: ScreenerRowDTO[] }) {
  const { rows, stale } = useLiveRows(initialRows);
  const [query, patch, reset] = useScreenerQuery();

  const statuses = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.status ?? "unknown")))],
    [rows]
  );
  const categories = useMemo(
    () => Array.from(new Set(rows.map((r) => r.category).filter((c): c is string => !!c))).sort(),
    [rows]
  );

  const sorted = useMemo(() => applyScreenerQuery(rows, query), [rows, query]);

  const th = (c: (typeof COLS)[number]) => (
    <th
      key={c.key}
      onClick={() => {
        if (query.sort === c.key) patch({ dir: query.dir === "desc" ? "asc" : "desc" });
        else patch({ sort: c.key, dir: c.key === "name" ? "asc" : "desc" });
      }}
      title={c.title}
      className={`cursor-pointer select-none hover:text-ink2 ${c.align === "right" ? "!text-right" : ""}`}
    >
      {c.label}
      {query.sort === c.key && <span className="ml-1 text-brand">{query.dir === "desc" ? "↓" : "↑"}</span>}
    </th>
  );

  const totals = useMemo(() => ({
    mcap: rows.reduce((s, r) => s + (r.mcap ?? 0), 0),
    liq: rows.reduce((s, r) => s + (r.liquidity_usd ?? 0), 0),
    vol: rows.reduce((s, r) => s + (r.vol24h ?? 0), 0),
  }), [rows]);

  return (
    <>
    {/* One per row on a phone, two on a tablet, all four across on desktop. */}
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4 lg:grid-cols-4">
      <Stat label="Projects" value={String(rows.length)} icon="layers" />
      <Stat label="Combined Mkt Cap" value={fmtUsd(totals.mcap)} icon="pie" />
      <Stat label="Total Liquidity" value={fmtUsd(totals.liq)} icon="droplet" />
      <Stat label="24h Volume" value={fmtUsd(totals.vol)} icon="chart" />
    </div>

    <div className="card">
      <div className="flex flex-wrap items-center gap-2 border-b border-grid px-4 py-3">
        {/* Chips are capitalised in CSS rather than in the string: `s` is the
            status value the filter compares against, so the label reads as a
            title without the data behind it changing shape. */}
        {statuses.map((s) => (
          <button key={s} onClick={() => patch({ status: s })} className="chip capitalize" data-on={query.status === s}>
            {s === "all" ? "All projects" : s}
          </button>
        ))}
        <span
          className="ml-auto flex items-center gap-1.5 text-[11.5px] text-faint"
          title={stale ? "Last quote could not be refreshed" : `Re-quoted every ${POLL_MS / 1000}s`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${stale ? "bg-warn" : "bg-good"}`} />
          {stale ? "Reconnecting" : "Live"}
        </span>
        <span className="num text-[12px] text-faint">{sorted.length} listed</span>
      </div>

      {/* The view. Every control writes to the same query the URL carries, so
          the address bar is always a link to exactly this table. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-grid px-4 py-2.5">
        <label className="relative flex min-w-0 flex-1 items-center sm:max-w-[240px]">
          <span className="pointer-events-none absolute left-2.5 text-muted">
            <Icon name="target" size={13} />
          </span>
          <input
            value={query.q}
            onChange={(e) => patch({ q: e.target.value.slice(0, 60) })}
            placeholder="Search name or symbol"
            aria-label="Search projects"
            className="h-8 w-full rounded-lg border border-line bg-surface2/60 pl-8 pr-2.5 text-[12px] text-ink
                       placeholder:text-faint transition-colors hover:border-line2
                       focus:border-line2 focus:outline-none"
          />
        </label>
        <select
          value={query.cat}
          onChange={(e) => patch({ cat: e.target.value })}
          aria-label="Filter by category"
          className="h-8 max-w-[180px] rounded-lg border border-line bg-surface2/60 px-2 text-[12px] text-ink2
                     transition-colors hover:border-line2 focus:outline-none"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <AmountInput
          value={query.minLiq}
          onChange={(v) => patch({ minLiq: v })}
          placeholder="Min liquidity"
          label="Minimum liquidity in USD"
        />
        <AmountInput
          value={query.minMcap}
          onChange={(v) => patch({ minMcap: v })}
          placeholder="Min mkt cap"
          label="Minimum market cap in USD"
        />
        {!isDefaultQuery(query) && (
          <button
            type="button"
            onClick={reset}
            className="h-8 rounded-lg border border-line px-2.5 text-[12px] text-ink2 transition-colors hover:border-line2 hover:text-ink"
          >
            Reset
          </button>
        )}
      </div>
      <div className="scroll-x">
        <table className="itable text-[13px]">
          <thead><tr>{COLS.map(th)}</tr></thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={COLS.length} className="py-8 text-center text-[13px] text-muted">
                  No project matches this view.{" "}
                  <button type="button" onClick={reset} className="text-brand hover:underline">Reset filters</button>
                </td>
              </tr>
            )}
            {sorted.map((r) => (
              <tr key={r.slug}>
                <td>
                  <span className="flex items-center gap-1.5">
                    <WatchButton slug={r.slug} size="sm" className="-ml-1.5" />
                    <Link href={`/project/${r.slug}`} className="flex items-center gap-2.5 hover:text-brand">
                      <Logo src={r.image_url} name={r.name} size={24} />
                      <span className="font-medium">{r.name}</span>
                      {r.symbol && <span className="text-[11px] text-muted">{r.symbol}</span>}
                    </Link>
                  </span>
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td className="text-right"><HealthCell score={r.health} measured={r.health_measured} /></td>
                <td className="num text-right">{fmtPrice(r.price_usd)}</td>
                <td className="text-right"><Delta v={r.change_24h} /></td>
                <td className="text-right" title={thinTitle(r)}>
                  {r.returns_thin && r.ret_7d != null && <span className="text-faint">~</span>}
                  <Delta v={r.ret_7d} />
                </td>
                <td className="text-right" title={thinTitle(r)}>
                  {r.returns_thin && r.ret_30d != null && <span className="text-faint">~</span>}
                  <Delta v={r.ret_30d} />
                </td>
                <td className="num text-right">{fmtUsd(r.mcap)}</td>
                <td className="num text-right">{fmtUsd(r.liquidity_usd)}</td>
                <td className="num text-right">{fmtUsd(r.vol24h)}</td>
                <td className="num text-right">
                  {r.raise_amount_usd === 0
                    ? <span className="text-muted" title="Raise failed to reach its minimum; all contributions refunded">$0</span>
                    : r.raise_amount_usd == null && r.raise_absence
                      ? <Absent kind={r.raise_absence} />
                      : fmtUsd(r.raise_amount_usd)}
                </td>
                <td
                  className="num text-right text-ink2"
                  title={r.raise_price_derived
                    ? "Derived: accepted raise ÷ 10,000,000 tokens sold, per MetaDAO's uniform-price sale"
                    : undefined}
                >
                  {r.raise_price_derived && <span className="text-faint">~</span>}
                  {r.raise_price == null && r.raise_absence
                    ? <Absent kind={r.raise_absence} />
                    : fmtPrice(r.raise_price)}
                </td>
                <td className="text-right" title={thinTitle(r)}>
                  {r.roi_since_raise == null && r.raise_absence
                    ? <Absent kind={r.raise_absence} />
                    : <>
                        {r.returns_thin && r.roi_since_raise != null && <span className="text-faint">~</span>}
                        <Delta v={r.roi_since_raise} />
                      </>}
                </td>
                <td className="num text-right text-ink2" title={thinTitle(r)}>
                  {r.ath_return == null && r.raise_absence
                    ? <Absent kind={r.raise_absence} />
                    : <>
                        {r.returns_thin && r.ath_return != null && <span className="text-faint">~</span>}
                        {fmtPct(r.ath_return)}
                      </>}
                </td>
                <td className="text-right" title={thinTitle(r)}>
                  {r.returns_thin && r.from_ath != null && <span className="text-faint">~</span>}
                  <Delta v={r.from_ath} />
                </td>
                <td className="num text-right" title={r.treasury_usd != null ? `USDC AUM in the DAO vault: $${r.treasury_usd}` : undefined}>
                  {r.treasury_usd != null && r.treasury_usd < 1
                    ? <span className="text-muted">~0</span>
                    : fmtUsd(r.treasury_usd)}
                </td>
                <td className="num text-right">{fmtNum(r.holder_count)}</td>
                <td className="num text-right">{fmtNum(r.gh_stars)}</td>
                <td className="num text-right text-ink2">{timeAgo(r.gh_last_push)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
    </>
  );
}
