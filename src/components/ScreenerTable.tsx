"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Delta, Logo, StatusBadge } from "./ui";
import { Icon, type IconName } from "./viz";
import { fmtUsd, fmtPrice, fmtNum, fmtPct, timeAgo } from "@/lib/format";
import { MIN_LIQUIDITY_USD } from "@/lib/quote";

export interface ScreenerRowDTO {
  slug: string; name: string; symbol: string | null; status: string | null;
  image_url: string | null; category: string | null;
  price_usd: number | null; mcap: number | null; fdv: number | null;
  liquidity_usd: number | null; vol24h: number | null; change_24h: number | null;
  raise_amount_usd: number | null; raise_price: number | null; raise_price_derived: boolean;
  roi_since_raise: number | null; ath_return: number | null;
  from_ath: number | null;
  /** Returns computed off a pool too thin to defend the price — mark them. */
  returns_thin: boolean;
  /** Why the raise figures are absent, when absence is a fact not a gap. */
  raise_absence: "no_ico" | "private_round" | "unpublished" | null;
  treasury_usd: number | null;
  holder_count: number | null;
  gh_stars: number | null; gh_last_push: number | null;
}

type SortKey = keyof ScreenerRowDTO;

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
      <div className="num mt-2.5 text-[22px] font-extrabold leading-none tracking-tight text-ink">
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

const COLS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "name", label: "Project" },
  { key: "status", label: "Status" },
  { key: "price_usd", label: "Price", align: "right" },
  { key: "change_24h", label: "24h", align: "right" },
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

export function ScreenerTable({ rows: initialRows }: { rows: ScreenerRowDTO[] }) {
  const { rows, stale } = useLiveRows(initialRows);
  const [sort, setSort] = useState<SortKey>("mcap");
  const [dir, setDir] = useState<1 | -1>(-1);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const statuses = useMemo(
    () => ["all", ...Array.from(new Set(rows.map((r) => r.status ?? "unknown")))],
    [rows]
  );

  const sorted = useMemo(() => {
    const filtered = statusFilter === "all" ? rows : rows.filter((r) => (r.status ?? "unknown") === statusFilter);
    return [...filtered].sort((a, b) => {
      const av = a[sort], bv = b[sort];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "string") return dir * av.localeCompare(String(bv));
      return dir * ((av as number) - (bv as number));
    });
  }, [rows, sort, dir, statusFilter]);

  const th = (c: (typeof COLS)[number]) => (
    <th
      key={c.key}
      onClick={() => {
        if (sort === c.key) setDir((d) => (d === 1 ? -1 : 1));
        else { setSort(c.key); setDir(c.key === "name" ? 1 : -1); }
      }}
      className={`cursor-pointer select-none hover:text-ink2 ${c.align === "right" ? "!text-right" : ""}`}
    >
      {c.label}
      {sort === c.key && <span className="ml-1 text-accent">{dir === -1 ? "↓" : "↑"}</span>}
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
        {statuses.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="chip" data-on={statusFilter === s}>
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
      <div className="scroll-x">
        <table className="itable text-[13px]">
          <thead><tr>{COLS.map(th)}</tr></thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.slug}>
                <td>
                  <Link href={`/project/${r.slug}`} className="flex items-center gap-2.5 hover:text-accent">
                    <Logo src={r.image_url} name={r.name} size={24} />
                    <span className="font-medium">{r.name}</span>
                    {r.symbol && <span className="text-[11px] text-muted">{r.symbol}</span>}
                  </Link>
                </td>
                <td><StatusBadge status={r.status} /></td>
                <td className="num text-right">{fmtPrice(r.price_usd)}</td>
                <td className="text-right"><Delta v={r.change_24h} /></td>
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
