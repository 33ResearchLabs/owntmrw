"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Delta, Logo, StatusBadge } from "./ui";
import { fmtUsd, fmtNum, fmtPct, timeAgo } from "@/lib/format";

export interface ScreenerRowDTO {
  slug: string; name: string; symbol: string | null; status: string | null;
  image_url: string | null; category: string | null;
  price_usd: number | null; mcap: number | null; fdv: number | null;
  liquidity_usd: number | null; vol24h: number | null; change_24h: number | null;
  raise_amount_usd: number | null; roi_since_raise: number | null; ath_return: number | null;
  from_ath: number | null;
  treasury_usd: number | null;
  holder_count: number | null; holder_change_7d: number | null;
  gh_stars: number | null; gh_last_push: number | null; proposal_count: number;
}

type SortKey = keyof ScreenerRowDTO;

/** The subset `/api/live` refreshes; everything else is archival. */
type LivePatch = Pick<
  ScreenerRowDTO,
  | "price_usd" | "mcap" | "fdv" | "liquidity_usd" | "vol24h" | "change_24h"
  | "roi_since_raise" | "ath_return" | "from_ath"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-4 py-3">
      <div className="text-[10.5px] uppercase tracking-[0.09em] text-faint">{label}</div>
      <div className="num mt-1 text-[18px] font-extrabold tracking-tight">{value}</div>
    </div>
  );
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
  { key: "roi_since_raise", label: "ROI vs Raise", align: "right" },
  { key: "ath_return", label: "ATH Return", align: "right" },
  { key: "from_ath", label: "From ATH", align: "right" },
  { key: "treasury_usd", label: "Treasury", align: "right" },
  { key: "holder_count", label: "Holders", align: "right" },
  { key: "holder_change_7d", label: "Holders 7d", align: "right" },
  { key: "proposal_count", label: "Proposals", align: "right" },
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
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Stat label="Projects" value={String(rows.length)} />
      <Stat label="Combined Mkt Cap" value={fmtUsd(totals.mcap)} />
      <Stat label="Total Liquidity" value={fmtUsd(totals.liq)} />
      <Stat label="24h Volume" value={fmtUsd(totals.vol)} />
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
                <td className="num text-right">{fmtUsd(r.price_usd)}</td>
                <td className="text-right"><Delta v={r.change_24h} /></td>
                <td className="num text-right">{fmtUsd(r.mcap)}</td>
                <td className="num text-right">{fmtUsd(r.liquidity_usd)}</td>
                <td className="num text-right">{fmtUsd(r.vol24h)}</td>
                <td className="num text-right">
                  {r.raise_amount_usd === 0
                    ? <span className="text-muted" title="Raise failed to reach its minimum; all contributions refunded">$0</span>
                    : fmtUsd(r.raise_amount_usd)}
                </td>
                <td className="text-right"><Delta v={r.roi_since_raise} /></td>
                <td className="num text-right text-ink2">{fmtPct(r.ath_return)}</td>
                <td className="text-right"><Delta v={r.from_ath} /></td>
                <td className="num text-right" title={r.treasury_usd != null ? `USDC AUM in the DAO vault: $${r.treasury_usd}` : undefined}>
                  {r.treasury_usd != null && r.treasury_usd < 1
                    ? <span className="text-muted">~0</span>
                    : fmtUsd(r.treasury_usd)}
                </td>
                <td className="num text-right">{fmtNum(r.holder_count)}</td>
                <td className="text-right"><Delta v={r.holder_change_7d} /></td>
                <td className="num text-right">{r.proposal_count || "—"}</td>
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
