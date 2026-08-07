import Link from "next/link";
import { raisePriceOf, tradingStart, type ProjectDetail, type RiskFlag } from "@/lib/queries";
import type { Insight } from "@/lib/analytics";
import type { Memo } from "@/lib/research";
import { entityColor } from "@/lib/sources/wallets";
import { classifyWallet, confidenceColor, holdingBand } from "@/lib/orgs";
import {
  fmtUsd,
  fmtNum,
  fmtPct,
  fmtPrice,
  fmtDate,
  fmtDuration,
  timeAgo,
  shortAddr,
} from "@/lib/format";
import { Delta, StatusBadge } from "./ui";
import { TrendCard, TrendSectionHeader } from "./viz";
import { DAY, changeVsAgo, deltaVsAgo } from "@/lib/series";
import { MoreRows } from "./MoreRows";
import { CopyButton } from "./CopyButton";

/** Shown wherever a section needs data we cannot obtain from public sources. */
export function DataGap({
  title,
  why,
  unlock,
}: {
  title: string;
  why: string;
  unlock?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-5">
      <div className="text-[13px] font-medium text-ink2">{title}</div>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">
        {why}
      </p>
      {unlock && (
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">
          <span className="text-ink2">To enable: </span>
          {unlock}
        </p>
      )}
    </div>
  );
}

export function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted">
        {label}
      </div>
      <div
        className={`num mt-0.5 text-[17px] font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}
      >
        {value}
      </div>
      {sub != null && <div className="mt-0.5 text-[11px] text-ink2">{sub}</div>}
    </div>
  );
}

/**
 * A dense grid of metrics with the empty ones dropped, for `SectionCard`-scale
 * panels. Distinct from the display-scale `MetricGrid` below it — that one is
 * for `DashboardCard`'s bigger, hero-style tiles.
 *
 * Panels used to render every tile unconditionally, so a token that never had a
 * public sale showed seven dashes for figures that do not exist for it — which
 * reads as a broken page rather than an inapplicable one. Same convention the
 * project brief already follows: no data, no tile.
 */
export function DenseMetricGrid({
  tiles,
}: {
  tiles: (false | null | undefined | {
    label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad";
  })[];
}) {
  const shown = tiles.filter(Boolean) as {
    label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad";
  }[];
  if (!shown.length) return null;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-4">
      {shown.map((t) => (
        <Metric key={t.label} label={t.label} value={t.value} sub={t.sub} tone={t.tone} />
      ))}
    </div>
  );
}

export function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  /**
   * One line under the title saying what the section is reading and from
   * where. Same scale and colour as `TrendSectionHeader`'s, so a page that
   * mixes the two does not appear to have two kinds of subheading.
   */
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-grid px-4 py-3">
        {/* The title and its subtitle travel together, so `right` still lands
            against the far edge instead of between them. */}
        <div>
          <h3 className="text-[14px] font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12px] font-normal text-ink2">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

/* ------------------------------------------------------- dashboard cards --- */

/**
 * The display-scale card: a bigger title and a controls slot that sits on its
 * own baseline rather than the title's, so an outlined button never drags the
 * heading off-centre. Deliberately separate from `SectionCard` — the dense
 * sections elsewhere on the page are still correct at their current scale.
 */
export function DashboardCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  /** One line under the title, at the same scale `SectionCard` uses. */
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 py-5 sm:px-6">
        {/* Same as the Market Depth header, which is the reference on this
            page — two cards stacked in one column should not announce
            themselves at two different weights. */}
        <div>
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[12.5px] font-normal text-ink2">{subtitle}</p>}
        </div>
        {right != null && <div className="flex flex-wrap items-center gap-2">{right}</div>}
      </div>
      {children}
    </section>
  );
}

/** Outlined action in a card header. Renders nothing without a destination. */
export function CardAction({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-line2 px-3 py-1.5 text-[12px] font-medium text-ink2 transition-colors duration-150 hover:border-accent hover:text-accent"
    >
      {children}
      <svg
        width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
      >
        <path d="M14 4h6v6" /><path d="M20 4 10.5 13.5" /><path d="M19 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4.5" />
      </svg>
    </a>
  );
}

/** Pill for a categorical tag in a card header (e.g. the raise track). */
export function CardTag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line2 bg-surface2 px-2.5 py-1 text-[10px] uppercase tracking-[0.08em] text-ink2">
      <span className="h-1.5 w-1.5 rounded-full bg-muted" aria-hidden />
      {children}
    </span>
  );
}

/**
 * Metric grid with hairline rules between every cell.
 *
 * The rules are the 1px grid gaps showing the divider colour through, not
 * per-cell borders: at 1/2/4 columns the wrap points move, and hand-placed
 * borders would leave a stray edge on whichever cell happens to end a row.
 */
export function MetricGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-px border-y border-grid bg-grid sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/** One cell of a `MetricGrid`. Same props as `Metric`, at display scale. */
export function MetricCell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "good" | "bad";
}) {
  return (
    <div className="flex flex-col bg-surface px-5 py-4 sm:py-5">
      {/* Matched to the Market Depth tiles — 10.5 / 22 / 11.5. Those sit on the
          same screen, so a figure that changed size between the two panels read
          as two different kinds of number rather than one scale. */}
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div
        className={`num mt-2 text-[22px] font-bold leading-none tracking-tight ${
          tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""
        }`}
      >
        {value}
      </div>
      {sub != null && <div className="mt-2 text-[11.5px] leading-snug text-muted">{sub}</div>}
    </div>
  );
}

/** Boxed note beneath a `MetricGrid` — caveats, provenance, methodology. */
export function CardNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-5 py-5 sm:px-6">
      <p className="rounded-xl border border-line bg-surface2 px-4 py-3.5 text-[12px] leading-relaxed text-muted">
        {children}
      </p>
    </div>
  );
}

// ------------------------------------------------------------------- risk

const RISK_TONE: Record<string, { color: string; label: string }> = {
  danger: { color: "var(--bad)", label: "Critical" },
  warn: { color: "var(--warn)", label: "Warning" },
  info: { color: "var(--ink-muted)", label: "Info" },
};

/**
 * Safety bands, descending. `floor` is inclusive, so 80 is the first Low Risk
 * score. The two middle colours sit close enough together that a reader cannot
 * reliably name the band from the fill alone, so the meter always states the
 * band in words — the colour reinforces the label rather than carrying it.
 */
const SAFETY_BANDS = [
  { floor: 80, color: "var(--good)", label: "Low risk" },
  { floor: 60, color: "var(--warn)", label: "Caution" },
  { floor: 40, color: "var(--serious)", label: "Elevated risk" },
  { floor: 0, color: "var(--bad)", label: "High risk" },
] as const;

const safetyBand = (score: number) =>
  SAFETY_BANDS.find((b) => score >= b.floor) ?? SAFETY_BANDS[SAFETY_BANDS.length - 1];

/**
 * Where this token's safety score falls on the 0-100 scale, and which band that
 * puts it in. A bare "74" says nothing about whether 74 is good; the banded
 * track is what makes it legible, and it is why the number is worth showing big.
 */
function SafetyMeter({ score }: { score: number | null }) {
  const band = score == null ? null : safetyBand(score);

  return (
    <div className="px-4 py-4">
      {/* The band word sits against the number, not out at the right edge:
          it is the part that survives when the colour cannot be judged. */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <span className="text-[28px] font-semibold leading-none" style={{ color: band?.color }}>
          {score ?? "—"}
        </span>
        <span className="text-[12px] text-faint">/ 100</span>
        <span className="text-[13px] font-medium" style={{ color: band?.color }}>
          {band?.label ?? "Not scored"}
        </span>
        <span className="text-[11px] text-muted">RugCheck safety score</span>
      </div>

      <div
        className="relative mt-2.5 h-2.5 overflow-hidden rounded-full bg-grid"
        role="meter"
        aria-valuenow={score ?? undefined}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`RugCheck safety score${band ? `: ${band.label}` : ""}`}
      >
        {score != null && (
          <div
            className="h-full rounded-full"
            style={{ width: `${Math.max(0, Math.min(100, score))}%`, background: band!.color }}
          />
        )}
        {/* Band edges are cut out of the track rather than drawn over it — a
            2px gap in the surface colour separates without adding ink. */}
        {SAFETY_BANDS.slice(0, -1).map((b) => (
          <span
            key={b.floor}
            className="absolute inset-y-0 w-0.5 bg-surface"
            style={{ left: `${b.floor}%` }}
          />
        ))}
      </div>

      <div className="num relative mt-1 h-3 text-[10px] text-faint">
        <span className="absolute left-0">0</span>
        {SAFETY_BANDS.slice(0, -1).map((b) => (
          <span key={b.floor} className="absolute -translate-x-1/2" style={{ left: `${b.floor}%` }}>
            {b.floor}
          </span>
        ))}
        <span className="absolute right-0">100</span>
      </div>
    </div>
  );
}

/**
 * Contract-level risk. The headline is RugCheck's normalised score, where
 * higher is safer — the raw score runs the other way, which is why only the
 * normalised figure is shown.
 */
export function RiskPanel({
  risk,
  flags,
}: {
  risk: ProjectDetail["risk"];
  flags: RiskFlag[];
}) {
  if (!risk) {
    return (
      <SectionCard
        title="Contract Risk"
        subtitle="Automated safety checks on the token contract itself — mint, freeze and liquidity locks."
      >
        <div className="p-4">
          <DataGap
            title="No contract risk check on file"
            why="Mint authority, freeze authority and LP lock status have not been verified for this token."
          />
        </div>
      </SectionCard>
    );
  }

  const safety = risk.score_normalised;
  const critical = flags.filter((f) => f.level === "danger").length;
  // Three states, not two. A null column means the report never carried the
  // field, and calling that "Revoked" in green is the one error this panel
  // must not make — it is the reassuring answer, asserted without evidence.
  const authority = (on: number | null, enabled: string, revoked: string) =>
    on == null
      ? { value: "Unknown", sub: "not reported by RugCheck", tone: undefined }
      : on
        ? { value: "Enabled", sub: enabled, tone: "bad" as const }
        : { value: "Revoked", sub: revoked, tone: "good" as const };
  const mint = authority(
    risk.mint_authority,
    "supply can still be inflated",
    "supply is fixed",
  );
  const freeze = authority(
    risk.freeze_authority,
    "balances can be frozen",
    "balances cannot be frozen",
  );

  return (
    <SectionCard
      title="Contract Risk"
      subtitle="Automated safety checks on the token contract itself — mint, freeze and liquidity locks."
      right={
        <span className="text-[11px] text-muted">
          {flags.length === 0
            ? "no flags raised"
            : `${flags.length} flag${flags.length === 1 ? "" : "s"}${critical ? ` · ${critical} critical` : ""}`}
        </span>
      }
    >
      <div className="border-b border-grid">
        <SafetyMeter score={safety} />
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-grid px-4 py-4 md:grid-cols-4">
        <Metric
          label="Mint Authority"
          value={<span className="text-[15px]">{mint.value}</span>}
          sub={mint.sub}
          tone={mint.tone}
        />
        <Metric
          label="Freeze Authority"
          value={<span className="text-[15px]">{freeze.value}</span>}
          sub={freeze.sub}
          tone={freeze.tone}
        />
        <Metric
          label="LP Locked"
          value={
            risk.lp_locked_pct != null
              ? `${risk.lp_locked_pct.toFixed(2)}%`
              : "—"
          }
          sub={
            risk.total_lp_providers != null
              ? `${risk.total_lp_providers} LP provider${risk.total_lp_providers === 1 ? "" : "s"}`
              : undefined
          }
        />
        <Metric
          label="Holders (on-chain)"
          value={risk.total_holders != null ? fmtNum(risk.total_holders) : "—"}
          sub="per RugCheck"
        />
      </div>

      {flags.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-muted">
          No risk flags raised.
        </p>
      ) : (
        <ul className="divide-y divide-grid">
          {flags.map((f, i) => {
            const t = RISK_TONE[f.level] ?? RISK_TONE.info;
            return (
              <li
                key={i}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5"
              >
                <span
                  className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  style={{ color: t.color, borderColor: `${t.color}66` }}
                >
                  {t.label}
                </span>
                <span className="text-[13px] font-medium text-ink">
                  {f.name}
                </span>
                <span className="min-w-0 flex-1 text-[12px] text-muted">
                  {f.description}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
        Automated contract checks from RugCheck. They describe what the token
        <em> can</em> do, not intent — an enabled mint authority is a
        capability, not proof of misuse.
      </p>
    </SectionCard>
  );
}

// --------------------------------------------------------------- listings

/** Venues shown before the tail is collapsed. */
const LISTINGS_VISIBLE = 5;

/**
 * Where the token actually trades. Centralised venues are called out because a
 * CEX listing is a materially different fact from another AMM pool appearing.
 */
export function ListingsPanel({
  listings,
}: {
  listings: ProjectDetail["listings"];
}) {
  if (listings.length === 0) {
    return (
      <SectionCard
        title="Exchange Listings"
        subtitle="Every venue we can see trading this token, and how much of the volume each one carries."
      >
        <div className="p-4">
          <DataGap
            title="No venues indexed for this token"
            why="CoinGecko reports no exchange tickers for this mint — either it is not listed there, or it trades only in pools the aggregator does not index."
          />
        </div>
      </SectionCard>
    );
  }
  const cex = listings.filter((l) => !l.is_dex);
  const totalVol = listings.reduce((s, l) => s + (l.volume_usd ?? 0), 0);

  // Listings arrive ordered by volume, so the first five are the venues that
  // actually matter; the tail is usually dust pools worth a few dollars a day.
  const row = (l: ProjectDetail["listings"][number]) => (
    <tr key={`${l.exchange}|${l.pair}`}>
      <td className="font-medium">
        {l.url ? (
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">
            {l.exchange}
          </a>
        ) : (
          l.exchange
        )}
      </td>
      <td className="num text-ink2">{l.pair}</td>
      <td>
        <span
          className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
            l.is_dex ? "border-line text-muted" : "border-accent/40 text-accent"
          }`}
        >
          {l.is_dex ? "DEX" : "CEX"}
        </span>
      </td>
      <td className="num text-right">
        {l.volume_usd != null ? fmtUsd(l.volume_usd) : "—"}
      </td>
      <td className="num text-right text-muted">
        {totalVol > 0 && l.volume_usd != null
          ? `${((l.volume_usd / totalVol) * 100).toFixed(1)}%`
          : "—"}
      </td>
    </tr>
  );
  const shown = listings.slice(0, LISTINGS_VISIBLE);
  const rest = listings.slice(LISTINGS_VISIBLE);

  return (
    <SectionCard
      title="Exchange Listings"
      subtitle="Every venue we can see trading this token, and how much of the volume each one carries."
      right={
        <span className="text-[11px] text-muted">
          {listings.length} venue{listings.length === 1 ? "" : "s"}
          {cex.length > 0 && (
            <>
              {" "}
              · <span className="text-ink2">{cex.length} centralised</span>
            </>
          )}
        </span>
      }
    >
      <div className="scroll-x">
        <table className="itable text-[13px]">
          <thead>
            <tr>
              <th>Venue</th>
              <th>Pair</th>
              <th>Type</th>
              <th className="!text-right">24h Volume</th>
              <th className="!text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(row)}
            <MoreRows count={rest.length} colSpan={5} noun="venues">
              {rest.map(row)}
            </MoreRows>
          </tbody>
        </table>
      </div>
      <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
        Venue volumes are self-reported to CoinGecko and are not independently
        verified.
      </p>
    </SectionCard>
  );
}

// ------------------------------------------------------------------ insights

export function InsightList({ items }: { items: Insight[] }) {
  if (!items.length) {
    return (
      <div className="px-4 py-6 text-center text-[13px] text-muted">
        No signals cross the reporting threshold yet.
      </div>
    );
  }
  return (
    <ul className="divide-y divide-grid">
      {items.map((o, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background:
                o.tone === "good"
                  ? "var(--good)"
                  : o.tone === "bad"
                    ? "var(--bad)"
                    : "var(--ink-muted)",
            }}
          />
          <span className="text-ink2">{o.text}</span>
          <span className="ml-auto shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {o.kind}
          </span>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------- holders

/**
 * How the total supply is split. Deliberately a stacked bar rather than the
 * donut this pattern usually gets: the two halves are near-equal on a typical
 * MetaDAO launch (half locked, half floating), and a donut is exactly the wrong
 * form for comparing close values.
 *
 * `liquidity_tokens` is not a segment — those tokens sit inside the circulating
 * float, so adding them would sum past 100%. They are stated underneath instead.
 * Anything the three known figures cannot account for is shown as unattributed
 * rather than folded into a segment that would then be wrong.
 */
function SupplyAllocation({ p }: { p: ProjectDetail["project"] }) {
  const total = p.total_supply;
  if (!total) return null;

  // Sub-0.05% figures are rounding dust from the supply feed, not allocations.
  const dust = total * 0.0005;
  const clean = (n: number | null | undefined) => (n != null && n > dust ? n : 0);
  const team = clean(p.team_package);
  const circulating = clean(p.circulating_supply);
  const unattributed = Math.max(0, total - team - circulating);

  const segments = [
    { key: "circulating", label: "Circulating", value: circulating, color: "var(--accent)" },
    { key: "team", label: "Team locked", value: team, color: "var(--series-2)" },
    { key: "unattributed", label: "Unattributed", value: unattributed, color: "var(--series-none)" },
  ].filter((s) => s.value > dust);

  // One segment is a one-bar bar chart — the Metric tiles already say it better.
  if (segments.length < 2) return null;

  const pool = clean(p.liquidity_tokens);

  return (
    <SectionCard
      title="Supply Allocation"
      subtitle="Where the supply actually sits — treasury, pools, and everything still in circulation."
    >
      <div className="px-4 py-4">
        <div className="flex h-3 w-full gap-0.5">
          {segments.map((s, i) => (
            <div
              key={s.key}
              className={`h-full ${i === 0 ? "rounded-l-full" : ""} ${i === segments.length - 1 ? "rounded-r-full" : ""}`}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            />
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
          {segments.map((s) => (
            <div key={s.key} className="flex items-baseline gap-2">
              <span
                className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                style={{ background: s.color }}
              />
              <span className="text-[12px] text-ink2">{s.label}</span>
              <span className="num text-[12px] font-medium">
                {((s.value / total) * 100).toFixed(1)}%
              </span>
              <span className="num text-[11px] text-faint">{fmtNum(s.value)}</span>
            </div>
          ))}
        </div>

        <p className="mt-3 text-[11px] text-muted">
          {fmtNum(total)} total supply
          {pool > 0 && (
            <> · {fmtNum(pool)} of the circulating float sits in liquidity pools</>
          )}
        </p>
      </div>
    </SectionCard>
  );
}

export function HoldersPanel({
  d,
}: {
  d: ProjectDetail;
}) {
  const { project: p, topHolders, holderHistory, latest } = d;
  const hh = holderHistory.filter((h) => h.holder_count != null);
  const cur = hh.length ? hh[hh.length - 1].holder_count! : null;
  const supply = p.circulating_supply ?? p.total_supply;
  const avgWallet = cur && supply ? supply / cur : null;
  const avgUsd =
    avgWallet && latest?.price_usd ? avgWallet * latest.price_usd : null;

  // Same lookback rule as the market tiles. This panel used to demand a
  // snapshot at or before the exact instant, with no tolerance, so MetaDAO's
  // oldest reading missed the seven-day mark by six and a half hours and Net 7d
  // sat empty beside a volume tile happily reporting 7d change from the very
  // same afternoon.
  const now = Math.floor(Date.now() / 1000);
  const series = hh.map((h) => ({ ts: h.ts, v: h.holder_count! }));
  const pctChg = (days: number) => changeVsAgo(cur, series, days * DAY, now);
  const chg = (days: number) => deltaVsAgo(cur, series, days * DAY, now);
  // The newest reading that carries each band, not necessarily the newest row:
  // concentration and holder count come from different sources and one can be
  // absent on a run the other succeeded on.
  const t10 =
    [...holderHistory].reverse().find((h) => h.top10_pct != null)?.top10_pct ??
    null;
  const t20 =
    [...holderHistory].reverse().find((h) => h.top20_pct != null)?.top20_pct ??
    null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Holder Base"
        subtitle="How many people hold this token, and how concentrated that ownership is."
        right={
          <span className="text-[11px] text-muted">
            {hh.length} snapshot{hh.length === 1 ? "" : "s"} recorded
          </span>
        }
      >
        <DenseMetricGrid
            tiles={[
              cur != null && { label: "Total Holders", value: fmtNum(cur) },
              // Kept even when empty: unlike the tiles below, these are metrics
              // that will populate as snapshots accumulate, and the sub says so.
              ...[7, 30].map((days) => ({
                label: `Net ${days}d`,
                value: pctChg(days) != null ? <Delta v={pctChg(days)} /> : "—",
                sub: chg(days) != null
                  ? `${chg(days)! >= 0 ? "+" : ""}${fmtNum(chg(days))} wallets`
                  : `needs ${days}d of history`,
              })),
              avgWallet != null && {
                label: "Avg Wallet", value: fmtNum(avgWallet),
                sub: avgUsd ? `${fmtUsd(avgUsd)} at spot` : "supply ÷ holders",
              },
              t10 != null && {
                label: "Top 10 Concentration", value: `${t10.toFixed(1)}%`,
                tone: t10 > 60 ? ("bad" as const) : t10 < 35 ? ("good" as const) : undefined,
              },
              t20 != null && {
                label: "Top 20 Concentration", value: `${t20.toFixed(1)}%`,
                sub: t10 != null ? `${(t20 - t10).toFixed(1)}% in ranks 11–20` : undefined,
              },
              p.circulating_supply != null && {
                label: "Circulating Supply", value: fmtNum(p.circulating_supply),
                sub: p.total_supply ? `of ${fmtNum(p.total_supply)} total` : undefined,
              },
              p.team_package != null && {
                label: "Locked (Team)", value: fmtNum(p.team_package),
                sub: p.total_supply
                  ? `${((p.team_package / p.total_supply) * 100).toFixed(0)}% of supply`
                  : undefined,
              },
              cur && latest?.mcap ? {
                label: "Market Cap / Holder", value: fmtUsd(latest.mcap / cur),
              } : false,
            ]}
          />
      </SectionCard>

      <SupplyAllocation p={p} />

      <SectionCard
        title="Top Holders"
        subtitle="The largest wallets on this token and how much of the supply each one controls."
      >
        {topHolders.length === 0 ? (
          <div className="p-4">
            <DataGap
              title="Per-wallet holder list unavailable"
              why="Public Solana RPC endpoints throttle getTokenLargestAccounts and refuse getProgramAccounts on the SPL Token program, which are the only keyless ways to enumerate a mint's holders. Rather than show a partial or stale list, nothing is shown."
              unlock="Set SOLANA_RPC_URL to any keyed endpoint (a free Helius or Triton tier is sufficient) and re-run npm run ingest. The table, wallet labels and concentration metrics populate automatically."
            />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Holder</th>
                  <th>Type</th>
                  <th className="!text-right">Balance</th>
                  <th className="!text-right">% Supply</th>
                  <th className="!text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {topHolders.map((h) => {
                  const owner = h.owner ?? h.address;
                  const value = latest?.price_usd
                    ? h.amount * latest.price_usd
                    : null;
                  const verdict = classifyWallet({
                    address: h.address,
                    owner: h.owner,
                    treasuryAddress: p.treasury_address,
                    launchAddress: p.launch_address,
                    poolAddress: p.pool_address,
                    teamAddress: p.team_address,
                    ammVaultAddress: p.amm_vault_address,
                    lpPoolAddress: p.lp_pool_address,
                    pct: h.pct,
                    venueLabel: h.label,
                  });
                  const org =
                    verdict ??
                    (h.label
                      ? {
                          label: h.label,
                          type: h.label,
                          isOrganisation: true,
                          confidence: "confirmed" as const,
                          reason: "Labelled from the wallet registry.",
                        }
                      : null);
                  return (
                    <tr key={h.rank}>
                      <td className="num text-faint">{h.rank}</td>
                      {/* The address, and only the address. Identity used to be
                          printed here too, so the column answered "who" in one
                          row and "what" in the next and the address vanished
                          behind a label the Type column was already showing. */}
                      <td className="!flex items-center gap-1.5">
                        <Link
                          href={`/wallet/${owner}`}
                          className="num hover:text-accent"
                          title={owner}
                        >
                          {shortAddr(owner)}
                        </Link>
                        <CopyButton value={owner} />
                      </td>
                      <td>
                        {/* One chip in every row. An identified account shows
                            what it is; everything else falls back to its size
                            band, because a wallet on 17% and one on 0.01% are
                            not the same finding and "Unidentified" said neither.
                            Size never overrides evidence — only fills its
                            absence, and a size-only guess is styled as the
                            inference it is. */}
                        {(() => {
                          const evidenced = org?.isOrganisation ? org : null;
                          const band = evidenced ? null : holdingBand(h.pct);
                          const label = evidenced?.label ?? band?.label ?? "Unidentified";
                          return (
                            <span
                              className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px]"
                              style={{
                                color: evidenced ? entityColor(evidenced.type) : "var(--ink-muted)",
                                background: "var(--surface-2)",
                              }}
                              title={
                                evidenced?.reason ??
                                (band
                                  ? `${band.label}: holds ${band.note}. Classified by position size because no on-chain role, registry match or cross-project pattern was found — this describes the holding, not the holder.`
                                  : "No on-chain role, registry match or cross-project pattern found.")
                              }
                            >
                              <span
                                className="h-1.5 w-1.5 rounded-full"
                                style={{
                                  background: evidenced
                                    ? confidenceColor(evidenced.confidence)
                                    : "var(--ink-faint)",
                                }}
                              />
                              {label}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="num text-right">{fmtNum(h.amount)}</td>
                      <td className="num text-right">
                        {h.pct != null ? `${h.pct.toFixed(2)}%` : "—"}
                      </td>
                      <td className="num text-right">{fmtUsd(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-grid px-4 py-2.5 text-[11px] leading-relaxed text-faint">
              Organisations are identified by evidence, not inference alone: a
              green dot means a confirmed on-chain role or documented address,
              amber means a strong pattern (e.g. top-holder across several
              MetaDAO raises). Hover any badge for the reason.
            </p>
          </div>
        )}
      </SectionCard>

      <DataGap
        title="Per-wallet PnL, average entry and buy/sell history"
        why="These require the full transaction history of every holder — hundreds of thousands of signature lookups per project. No keyless public endpoint serves that volume, and estimating cost basis without the trades would be fabrication."
        unlock="A keyed RPC with getSignaturesForAddress, or an indexer such as Helius parsed-transaction history."
      />
    </div>
  );
}

// -------------------------------------------------------------- smart money

export function SmartMoneyPanel({ d }: { d: ProjectDetail }) {
  const whaleEvents = d.events.filter(
    (e) => e.type === "whale_buy" || e.type === "whale_sell",
  );
  return (
    <div className="space-y-5">
      <SectionCard
        title="Smart Money Flow"
        subtitle="What the wallets with a track record are doing with this token right now."
      >
        {whaleEvents.length === 0 ? (
          <div className="p-4">
            <DataGap
              title="Whale flow tracking is not active"
              why="Identifying accumulation, distribution and smart-money entries means diffing every holder's balance between two points in time, then scoring those wallets by their historical returns across projects. Both steps need the per-wallet history that keyless RPCs cannot serve."
              unlock="A keyed RPC. Once holder snapshots carry per-wallet balances, this panel fills in from data already modelled in the schema: largest buys and sells, net whale accumulation, new whale entries, and cross-project smart-money scoring."
            />
          </div>
        ) : (
          <ul className="divide-y divide-grid">
            {whaleEvents.map((e, i) => (
              <li
                key={i}
                className="flex items-baseline gap-3 px-4 py-2.5 text-[13px]"
              >
                <span className="num w-24 shrink-0 text-muted">
                  {fmtDate(e.ts)}
                </span>
                <span
                  className={e.type === "whale_buy" ? "text-good" : "text-bad"}
                >
                  {e.type === "whale_buy" ? "BUY" : "SELL"}
                </span>
                <span className="text-ink2">{e.title}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------- treasury

/**
 * Just the two headline cards — split out so the Overview tab can show the
 * same summary without pulling in the detail table and address link that
 * belong to the full Treasury tab underneath it.
 */
export function TreasuryTrendCards({ d, nowSec }: { d: ProjectDetail; nowSec: number }) {
  const { treasuryValue, treasuryHistory, liquidityHistory, latest } = d;

  // Real series, not derived figures: treasuryHistory is already deduped to
  // actual balance changes (see projectDetail), and liquidity is read raw
  // since a pool's depth genuinely moves on every read rather than stepping.
  // changeVsAgo is the one lookback implementation the codebase uses
  // everywhere else, specifically so this panel and the market tiles cannot
  // disagree about what "vs 7d ago" means the way two of them once did.
  const treasurySeries = treasuryHistory
    .map((t) => ({ ts: t.ts, v: t.value_usd }))
    .filter((r): r is { ts: number; v: number } => r.v != null);
  const treasuryDelta = changeVsAgo(treasuryValue, treasurySeries, 7 * DAY, nowSec);

  const liquiditySeries = liquidityHistory
    .map((l) => ({ ts: l.ts, v: l.liquidity_usd }))
    .filter((r): r is { ts: number; v: number } => r.v != null);
  const liquidityDelta = changeVsAgo(latest?.liquidity_usd, liquiditySeries, 7 * DAY, nowSec);

  if (!treasurySeries.length && !liquiditySeries.length) return null;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {treasurySeries.length > 0 && (
        <TrendCard
          color="var(--good)" label="Treasury Value"
          value={treasuryValue != null ? (treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue)) : "—"}
          deltaPct={treasuryDelta} deltaLabel="vs 7d ago"
          series={treasurySeries.map((s) => s.v)}
        />
      )}
      {liquiditySeries.length > 0 && (
        <TrendCard
          color="var(--accent)" label="Available Liquidity"
          value={fmtUsd(latest?.liquidity_usd ?? null)}
          deltaPct={liquidityDelta} deltaLabel="vs 7d ago"
          series={liquiditySeries.map((s) => s.v)}
        />
      )}
    </div>
  );
}

export function TreasuryPanel({ d, nowSec }: { d: ProjectDetail; nowSec: number }) {
  const {
    project: p,
    treasuryValue,
    treasuryHistory,
    treasuryLastRead,
    latest,
  } = d;
  const vsRaise =
    treasuryValue && p.raise_amount_usd
      ? treasuryValue / p.raise_amount_usd
      : null;
  const vsMcap =
    treasuryValue && latest?.mcap ? treasuryValue / latest.mcap : null;

  return (
    <div className="space-y-5">
      <section className="card px-5 py-5 sm:px-6">
        <TrendSectionHeader
          title="Treasury at a Glance"
          subtitle="Vault balance and pool depth, read on-chain as of the last ingest."
          action={
            p.treasury_address ? (
              <a
                href={`https://solscan.io/account/${p.treasury_address}`}
                target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink2 hover:border-accent hover:text-accent"
              >
                View vault ↗
              </a>
            ) : undefined
          }
        />
        <TreasuryTrendCards d={d} nowSec={nowSec} />
      </section>
      <SectionCard
        title="Treasury"
        subtitle="What the project holds and how deep its pools run, read on-chain."
        right={
          p.treasury_address ? (
            <a
              href={`https://solscan.io/account/${p.treasury_address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="num text-[11px] text-accent hover:underline"
            >
              {shortAddr(p.treasury_address)} ↗
            </a>
          ) : undefined
        }
      >
        <DenseMetricGrid
          tiles={[
            treasuryValue != null && {
              label: "Current Value",
              value: treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue),
              sub: "USDC AUM in the DAO vault",
            },
            p.raise_amount_usd != null && {
              label: "Raised",
              value: p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd),
            },
            vsRaise != null && {
              label: "Remaining vs Raise",
              value: `${(vsRaise * 100).toFixed(0)}%`,
              tone: vsRaise > 0.7 ? ("good" as const) : vsRaise < 0.2 ? ("bad" as const) : undefined,
            },
            vsMcap != null && {
              label: "Treasury / Mkt Cap",
              value: `${(vsMcap * 100).toFixed(0)}%`,
              sub: vsMcap > 0.5 ? "backed above half of valuation" : undefined,
            },
          ]}
        />
      </SectionCard>

      {treasuryHistory.length > 0 && (
        <SectionCard
          title="Treasury History"
          subtitle="Every balance change we have recorded, so you can see the runway moving."
          right={
            <span className="text-[11px] text-muted">
              one row per balance change · read {timeAgo(treasuryLastRead)}
            </span>
          }
        >
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead>
                <tr>
                  <th>Changed</th>
                  <th className="!text-right">Value</th>
                  <th className="!text-right">Change</th>
                  <th className="!text-right">Held</th>
                </tr>
              </thead>
              <tbody>
                {[...treasuryHistory]
                  .reverse()
                  .slice(0, 20)
                  .map((t, i, arr) => {
                    const prev = arr[i + 1];
                    const delta =
                      prev && prev.value_usd
                        ? ((t.value_usd! - prev.value_usd) / prev.value_usd) *
                          100
                        : null;
                    // A balance holds until the next change starts, or — for the
                    // current one — until now: nothing on file says it moved, so
                    // it's still that value. Using last_seen_ts here instead (the
                    // last time ingest happened to confirm it) understated this
                    // badly whenever ingest had gone a while without running —
                    // a balance that changed 6 days ago read as "held 6h" the
                    // moment ingest fell behind, flatly contradicting the date
                    // right next to it. Staleness is what treasuryLastRead is for.
                    const until = i === 0 ? Math.floor(Date.now() / 1000) : arr[i - 1].ts;
                    return (
                      <tr key={t.ts}>
                        <td className="num text-ink2">{fmtDate(t.ts)}</td>
                        <td className="num text-right">
                          {fmtUsd(t.value_usd)}
                        </td>
                        <td className="text-right">
                          <Delta v={delta} />
                        </td>
                        <td className="num text-right text-muted">
                          {fmtDuration(until - t.ts)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      <DataGap
        title="Line-item treasury transactions"
        why="Categorised inflows and outflows (salaries, grants, liquidity provision, investments) require parsing every transfer in and out of the vault and classifying counterparties."
        unlock="A keyed RPC with parsed transaction history for the treasury vault address."
      />
    </div>
  );
}

// ---------------------------------------------------------------- vs raise

export function CompareRaisePanel({ d }: { d: ProjectDetail }) {
  const {
    project: p,
    latest,
    candles,
    ath,
    atl,
    athTs,
    holderHistory,
    treasuryHistory,
    treasuryValue,
  } = d;
  const cur = latest?.price_usd ?? null;
  const rp = raisePriceOf(p);
  const roi = rp && cur ? ((cur - rp.usd) / rp.usd) * 100 : null;
  const athRet = rp && ath ? ((ath - rp.usd) / rp.usd) * 100 : null;
  const atlRet = rp && atl ? ((atl - rp.usd) / rp.usd) * 100 : null;
  const drawdown = ath && cur ? ((cur - ath) / ath) * 100 : null;
  const start = tradingStart(p, candles);
  const daysToAth =
    athTs && start ? Math.max(0, Math.round((athTs - start) / 86400)) : null;
  const hh = holderHistory.filter((h) => h.holder_count != null);
  const holdersNow = hh.length ? hh[hh.length - 1].holder_count : null;

  // Five glanceable cards above the detail grid below, each real: price and
  // ROI read straight off the candle history against the raise price; market
  // cap multiplies that same price series by today's circulating supply, so
  // it moves in lockstep with ROI where supply hasn't changed and is stated
  // as such rather than implying a supply-adjusted history this app does not
  // have. Holder growth is measured from the earliest tracked reading, not
  // "at raise" — no snapshot exists from the raise date itself, and claiming
  // one would be exactly the fabrication this file exists to avoid.
  const supply = p.circulating_supply;
  const raiseMcap = rp && supply ? rp.usd * supply : null;
  const curMcap = latest?.mcap ?? (cur && supply ? cur * supply : null);
  const mcapGrowth = raiseMcap && curMcap ? ((curMcap - raiseMcap) / raiseMcap) * 100 : null;
  const mcapSeries = supply ? candles.map((c) => c.c * supply) : [];
  const holderBaseline = hh.length ? hh[0].holder_count : null;
  const holderGrowth = holderBaseline && holdersNow ? ((holdersNow - holderBaseline) / holderBaseline) * 100 : null;
  const treasuryGrowth = treasuryValue != null && p.raise_amount_usd
    ? ((treasuryValue - p.raise_amount_usd) / p.raise_amount_usd) * 100 : null;
  const treasurySeries = treasuryHistory.map((t) => t.value_usd).filter((v): v is number => v != null);

  return (
    <div className="space-y-5">
      {(rp || treasuryGrowth != null || holderGrowth != null) && (
        <section className="card px-5 py-5 sm:px-6">
          <TrendSectionHeader
            title="Track this project from raise to today."
            subtitle="Measure real performance, not just price. ROI, treasury growth, holder growth and market cap evolution, all since day one."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {rp && cur != null && candles.length > 0 && (
            <TrendCard
              color="var(--accent)" label="Raise vs Current"
              value={fmtPrice(cur)}
              deltaPct={roi} deltaLabel={`vs raise ${fmtPrice(rp.usd)}`}
              series={candles.map((c) => c.c)}
            />
          )}
          {roi != null && (
            <TrendCard
              color="var(--good)" label="ROI Since Raise"
              value={fmtPct(roi)}
              deltaPct={roi} deltaLabel="vs raise price"
              series={candles.map((c) => ((c.c - rp!.usd) / rp!.usd) * 100)}
            />
          )}
          {mcapGrowth != null && (
            <TrendCard
              color="var(--warn)" label="Market Cap Growth"
              value={fmtUsd(curMcap)}
              deltaPct={mcapGrowth} deltaLabel={`vs raise ${fmtUsd(raiseMcap)}`}
              series={mcapSeries}
              title={`Raise-time cap here is raise price × today's circulating supply, so it moves with ROI rather than history — not the same figure as "Raise Valuation" below, which uses the supply that actually existed at the raise.`}
            />
          )}
          {holderGrowth != null && (
            <TrendCard
              color="var(--good)" label="Holder Growth"
              value={fmtNum(holdersNow)}
              deltaPct={holderGrowth} deltaLabel="since tracking began"
              series={hh.map((h) => h.holder_count!)}
            />
          )}
          {treasuryValue != null && (
            <TrendCard
              color="var(--accent)" label="Treasury Growth"
              value={treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue)}
              deltaPct={treasuryGrowth}
              deltaLabel={p.raise_amount_usd ? `vs raised ${fmtUsd(p.raise_amount_usd)}` : undefined}
              series={treasurySeries}
            />
          )}
          </div>
        </section>
      )}
    <DashboardCard
      title="Performance Since Raise"
      subtitle="How the token has actually done against the price its backers paid."
      right={<CardAction href={p.raise_source_url}>Data source</CardAction>}
    >
      <MetricGrid>
        {rp && (
          <MetricCell
            label="Raise Price"
            value={`${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`}
            sub={rp.derived ? "derived: raise ÷ 10M sold" : undefined}
          />
        )}
        {drawdown != null && (
          <MetricCell label="Current Drawdown" value={<Delta v={drawdown} />} sub="from all-time high" />
        )}
        {ath != null && (
          <MetricCell
            label="ATH"
            value={fmtPrice(ath)}
            sub={athRet != null ? `${fmtPct(athRet)} vs raise` : undefined}
          />
        )}
        {atl != null && (
          <MetricCell
            label="ATL"
            value={fmtPrice(atl)}
            sub={atlRet != null ? `${fmtPct(atlRet)} vs raise` : undefined}
          />
        )}
        {daysToAth != null && (
          <MetricCell label="Days to ATH" value={`${daysToAth}d`} sub={athTs ? fmtDate(athTs) : undefined} />
        )}
        {p.raise_contributors != null && (
          <MetricCell label="Contributors at Raise" value={fmtNum(p.raise_contributors)} />
        )}
        {p.raise_committed_usd != null && (
          <MetricCell
            label="Committed"
            value={fmtUsd(p.raise_committed_usd)}
            sub={
              p.raise_amount_usd
                ? `${Math.round(p.raise_committed_usd / p.raise_amount_usd)}× oversubscribed`
                : undefined
            }
          />
        )}
        {p.raise_fdv_usd != null && <MetricCell label="Raise FDV" value={fmtUsd(p.raise_fdv_usd)} />}
      </MetricGrid>
      {!p.raise_track && (
        <CardNote>
          Not a launchpad sale, so the public-sale figures — per-token price,
          minimum, commitments, contributor count — do not exist for this token
          and are omitted rather than shown empty.
        </CardNote>
      )}
    </DashboardCard>
    </div>
  );
}

// -------------------------------------------------------------------- news

type FeedItem = {
  ts: number;
  title: string;
  url: string | null;
  source: string | null;
};

function FeedList({
  items,
  showSource,
}: {
  items: FeedItem[];
  showSource?: boolean;
}) {
  return (
    <ul className="divide-y divide-grid">
      {items.map((n, i) => (
        <li
          key={i}
          className="flex flex-wrap items-baseline gap-3 px-4 py-2.5 text-[13px]"
        >
          <span className="num w-24 shrink-0 text-muted">{fmtDate(n.ts)}</span>
          {showSource && n.source && (
            <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink2">
              {n.source}
            </span>
          )}
          <span className="min-w-0 flex-1">
            {n.url ? (
              <a
                href={n.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-accent"
              >
                {n.title}
              </a>
            ) : (
              n.title
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function NewsPanel({
  items,
  releases = [],
  project,
}: {
  items: FeedItem[];
  releases?: FeedItem[];
  project: {
    twitter: string | null;
    website: string | null;
    github: string | null;
    docs: string | null;
  };
}) {
  return (
    <div className="space-y-5">
      <SectionCard
        title="News & Announcements"
        subtitle="Everything this project has said publicly, pulled from its own channels."
      >
        {items.length === 0 ? (
          <div className="p-4">
            <DataGap
              title="No news or announcement feed indexed for this project"
              why="No external news wire is integrated, this project has no discoverable RSS/Atom feed on its site, and X/Twitter has no keyless public API for reading a timeline. Repository releases are listed separately below — they are engineering output, not press coverage."
              unlock="Add a blog or RSS URL to the project record, or wire a news wire such as CryptoPanic."
            />
          </div>
        ) : (
          <FeedList items={items} showSource />
        )}
      </SectionCard>

      {releases.length > 0 && (
        <SectionCard
          title="Repository Releases"
          subtitle="Tagged versions shipped from this project's repositories."
          right={
            <span className="text-[11px] text-muted">
              {releases.length} git tag{releases.length === 1 ? "" : "s"} · not
              press coverage
            </span>
          }
        >
          <FeedList items={releases} />
        </SectionCard>
      )}

      <SectionCard
        title="Official Channels"
        subtitle="The accounts and sites this project actually publishes from."
      >
        <div className="flex flex-wrap gap-3 px-4 py-4 text-[13px]">
          {(
            [
              ["Website", project.website],
              ["X / Twitter", project.twitter],
              ["GitHub", project.github],
              ["Docs", project.docs],
            ] as const
          )
            .filter(([, u]) => u)
            .map(([label, url]) => (
              <a
                key={label}
                href={url!}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-line px-2.5 py-1 text-ink2 hover:border-accent/50 hover:text-accent"
              >
                {label} ↗
              </a>
            ))}
          {!project.website &&
            !project.twitter &&
            !project.github &&
            !project.docs && (
              <span className="text-muted">No official links indexed.</span>
            )}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------- research

export function ResearchPanel({ memo }: { memo: Memo }) {
  const List = ({
    items,
    tone,
  }: {
    items: string[];
    tone?: "good" | "bad";
  }) => (
    <ul className="space-y-2 px-4 py-3.5">
      {items.map((s, i) => (
        <li
          key={i}
          className="flex gap-2.5 text-[13px] leading-relaxed text-ink2"
        >
          <span
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{
              background:
                tone === "good"
                  ? "var(--good)"
                  : tone === "bad"
                    ? "var(--bad)"
                    : "var(--ink-muted)",
            }}
          />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <SectionCard
        title="Executive Summary"
        subtitle="The short version — what this project is and where it stands today."
      >
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
          {memo.summary}
        </p>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Bull Case"
          subtitle="What has to go right."
        >
          <List items={memo.bull} tone="good" />
        </SectionCard>
        <SectionCard
          title="Bear Case"
          subtitle="What could go wrong."
        >
          <List items={memo.bear} tone="bad" />
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Strengths"
          subtitle="What this project already has going for it."
        >
          {memo.strengths.length ? (
            <List items={memo.strengths} tone="good" />
          ) : (
            <p className="px-4 py-3.5 text-[13px] text-muted">
              None identified from the indexed metrics.
            </p>
          )}
        </SectionCard>
        <SectionCard
          title="Weaknesses"
          subtitle="Where it is thin."
        >
          {memo.weaknesses.length ? (
            <List items={memo.weaknesses} tone="bad" />
          ) : (
            <p className="px-4 py-3.5 text-[13px] text-muted">
              None identified from the indexed metrics.
            </p>
          )}
        </SectionCard>
      </div>

      <SectionCard
        title="Risks"
        subtitle="The things most likely to derail this project, and how exposed it is to each."
      >
        <List items={memo.risks} tone="bad" />
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Momentum"
          subtitle="Which way it is trending."
        >
          <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
            {memo.momentum}
          </p>
        </SectionCard>
        <SectionCard
          title="Competition"
          subtitle="Who else is building this."
        >
          <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
            {memo.competition}
          </p>
        </SectionCard>
      </div>

      {memo.developments.length > 0 && (
        <SectionCard
          title="Recent Developments"
          subtitle="What has changed lately."
        >
          <List items={memo.developments} />
        </SectionCard>
      )}

      <SectionCard
        title="Long-term Outlook"
        subtitle="Where this project could plausibly end up, and what it would take to get there."
      >
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
          {memo.outlook}
        </p>
      </SectionCard>

      <p className="text-[11px] leading-relaxed text-muted">
        This memo is generated from indexed on-chain and public data at page
        load. Every claim restates a measured figure shown elsewhere on this
        page — it contains no forecasts and is not investment advice.
      </p>
    </div>
  );
}

// -------------------------------------------------------------- governance

export function GovernancePanel({ d }: { d: ProjectDetail }) {
  const { proposals, project: p } = d;
  return (
    <div className="space-y-5">
      <SectionCard
        title="Proposals"
        subtitle="What this project's holders have been asked to decide, and how they voted."
        right={
          <span className="text-[11px] text-muted">
            {proposals.length} indexed
          </span>
        }
      >
        {proposals.length === 0 ? (
          <div className="p-4">
            <DataGap
              title="No proposals indexed"
              why="MetaDAO's proposals API requires authentication, and enumerating them on-chain needs getProgramAccounts against the futarchy program — which public RPC endpoints refuse for programs of that size."
              unlock="Set SOLANA_RPC_URL to a keyed endpoint. The futarchy program address is already configured in the ingestion layer."
            />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Proposal</th>
                  <th>State</th>
                  <th className="!text-right">Date</th>
                </tr>
              </thead>
              <tbody>
                {proposals.map((pr, i) => (
                  <tr key={i}>
                    <td className="num text-muted">{pr.number ?? "—"}</td>
                    <td className="max-w-[420px] truncate">
                      {pr.url ? (
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-accent"
                        >
                          {pr.title ?? "Proposal"}
                        </a>
                      ) : (
                        (pr.title ?? "Proposal")
                      )}
                    </td>
                    <td>
                      <StatusBadge status={pr.state} />
                    </td>
                    <td className="num text-right text-ink2">
                      {fmtDate(pr.created_ts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Governance Model"
        subtitle="How decisions get made here, and who actually gets a vote."
      >
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
          {p.name} is governed by MetaDAO futarchy: proposals are decided by
          conditional prediction markets rather than token votes. Each proposal
          spawns pass and fail markets, and the outcome is determined by which
          market prices the token higher — so the treasury is steered by traders
          forecasting value, not by turnout.
        </p>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------- timeline

export function TimelinePanel({
  events,
}: {
  events: {
    ts: number;
    type: string;
    title: string;
    detail: string | null;
    url: string | null;
  }[];
}) {
  if (!events.length) {
    return (
      <div className="card px-4 py-8 text-center text-[13px] text-muted">
        No events indexed yet.
      </div>
    );
  }
  return (
    <div className="card">
      <ul className="divide-y divide-grid">
        {events.map((e, i) => (
          <li key={i} className="flex gap-4 px-4 py-3">
            <span className="num w-24 shrink-0 pt-0.5 text-[12px] text-muted">
              {fmtDate(e.ts)}
            </span>
            <span className="relative flex w-3 shrink-0 justify-center">
              <span className="absolute top-1.5 h-2 w-2 rounded-full bg-accent" />
              {i < events.length - 1 && (
                <span className="absolute top-4 bottom-[-14px] w-px bg-grid" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink2">
                  {e.type.replace(/_/g, " ")}
                </span>
                <span className="text-[13px]">
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
                <span className="ml-auto text-[11px] text-muted">
                  {timeAgo(e.ts)}
                </span>
              </div>
              {e.detail && (
                <p className="mt-0.5 text-[12px] text-ink2">{e.detail}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
