import { Fragment } from "react";
import Link from "next/link";
import type { ProjectDetail, RiskFlag } from "@/lib/queries";
import type { Insight, CoverageRow } from "@/lib/analytics";
import { coverageColor, coverageLabel } from "@/lib/analytics";
import type { Memo } from "@/lib/research";
import { entityColor } from "@/lib/sources/wallets";
import { classifyWallet, confidenceColor } from "@/lib/orgs";
import { fmtUsd, fmtNum, fmtPct, fmtDate, timeAgo, shortAddr } from "@/lib/format";
import { Delta, StatusBadge } from "./ui";

/** Shown wherever a section needs data we cannot obtain from public sources. */
export function DataGap({ title, why, unlock }: { title: string; why: string; unlock?: string }) {
  return (
    <div className="rounded-md border border-dashed border-line px-4 py-5">
      <div className="text-[13px] font-medium text-ink2">{title}</div>
      <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-muted">{why}</p>
      {unlock && (
        <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">
          <span className="text-ink2">To enable: </span>{unlock}
        </p>
      )}
    </div>
  );
}

export function Metric({ label, value, sub, tone }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.06em] text-muted">{label}</div>
      <div className={`num mt-0.5 text-[17px] font-semibold ${tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""}`}>
        {value}
      </div>
      {sub != null && <div className="mt-0.5 text-[11px] text-ink2">{sub}</div>}
    </div>
  );
}

export function SectionCard({ title, right, children }: {
  title: string; right?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-grid px-4 py-3">
        <h3 className="text-[14px] font-semibold">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

// ------------------------------------------------------------------- risk

const RISK_TONE: Record<string, { color: string; label: string }> = {
  danger: { color: "var(--bad)", label: "Critical" },
  warn: { color: "var(--warn)", label: "Warning" },
  info: { color: "var(--ink-muted)", label: "Info" },
};

/**
 * Contract-level risk. The headline is RugCheck's normalised score, where
 * higher is safer — the raw score runs the other way, which is why only the
 * normalised figure is shown.
 */
export function RiskPanel({ risk, flags }: { risk: ProjectDetail["risk"]; flags: RiskFlag[] }) {
  if (!risk) {
    return (
      <SectionCard title="Contract Risk">
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
  const tone = safety == null ? "var(--ink-muted)" : safety >= 80 ? "var(--good)" : safety >= 60 ? "var(--warn)" : "var(--bad)";
  const authority = (on: number | null, name: string) =>
    on ? { text: `${name} enabled`, tone: "bad" as const } : { text: `${name} revoked`, tone: "good" as const };
  const mint = authority(risk.mint_authority, "Mint");
  const freeze = authority(risk.freeze_authority, "Freeze");

  return (
    <SectionCard
      title="Contract Risk"
      right={
        <span className="flex items-center gap-1.5 text-[11px] text-muted">
          RugCheck safety
          <span className="num text-[13px] font-semibold" style={{ color: tone }}>{safety ?? "—"}</span>
          <span className="text-faint">/100</span>
        </span>
      }
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-b border-grid px-4 py-4 md:grid-cols-4">
        <Metric
          label="Mint Authority" value={<span className="text-[15px]">{risk.mint_authority ? "Enabled" : "Revoked"}</span>}
          sub={risk.mint_authority ? "supply can still be inflated" : "supply is fixed"}
          tone={mint.tone}
        />
        <Metric
          label="Freeze Authority" value={<span className="text-[15px]">{risk.freeze_authority ? "Enabled" : "Revoked"}</span>}
          sub={risk.freeze_authority ? "balances can be frozen" : "balances cannot be frozen"}
          tone={freeze.tone}
        />
        <Metric
          label="LP Locked"
          value={risk.lp_locked_pct != null ? `${risk.lp_locked_pct.toFixed(2)}%` : "—"}
          sub={risk.total_lp_providers != null ? `${risk.total_lp_providers} LP provider${risk.total_lp_providers === 1 ? "" : "s"}` : undefined}
        />
        <Metric
          label="Holders (on-chain)"
          value={risk.total_holders != null ? fmtNum(risk.total_holders) : "—"}
          sub="per RugCheck"
        />
      </div>

      {flags.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-muted">No risk flags raised.</p>
      ) : (
        <ul className="divide-y divide-grid">
          {flags.map((f, i) => {
            const t = RISK_TONE[f.level] ?? RISK_TONE.info;
            return (
              <li key={i} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span
                  className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
                  style={{ color: t.color, borderColor: `${t.color}66` }}
                >
                  {t.label}
                </span>
                <span className="text-[13px] font-medium text-ink">{f.name}</span>
                <span className="min-w-0 flex-1 text-[12px] text-muted">{f.description}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
        Automated contract checks from RugCheck. They describe what the token
        <em> can</em> do, not intent — an enabled mint authority is a capability, not proof of misuse.
      </p>
    </SectionCard>
  );
}

// --------------------------------------------------------------- listings

/**
 * Where the token actually trades. Centralised venues are called out because a
 * CEX listing is a materially different fact from another AMM pool appearing.
 */
export function ListingsPanel({ listings }: { listings: ProjectDetail["listings"] }) {
  if (listings.length === 0) {
    return (
      <SectionCard title="Exchange Listings">
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
  return (
    <SectionCard
      title="Exchange Listings"
      right={
        <span className="text-[11px] text-muted">
          {listings.length} venue{listings.length === 1 ? "" : "s"}
          {cex.length > 0 && <> · <span className="text-ink2">{cex.length} centralised</span></>}
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
            {listings.map((l) => (
              <tr key={`${l.exchange}|${l.pair}`}>
                <td className="font-medium">
                  {l.url
                    ? <a href={l.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{l.exchange}</a>
                    : l.exchange}
                </td>
                <td className="num text-ink2">{l.pair}</td>
                <td>
                  <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${
                    l.is_dex ? "border-line text-muted" : "border-accent/40 text-accent"
                  }`}>
                    {l.is_dex ? "DEX" : "CEX"}
                  </span>
                </td>
                <td className="num text-right">{l.volume_usd != null ? fmtUsd(l.volume_usd) : "—"}</td>
                <td className="num text-right text-muted">
                  {totalVol > 0 && l.volume_usd != null ? `${((l.volume_usd / totalVol) * 100).toFixed(1)}%` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
        Venue volumes are self-reported to CoinGecko and are not independently verified.
      </p>
    </SectionCard>
  );
}

// --------------------------------------------------------------- coverage

const PRIORITY_LABEL: Record<CoverageRow["priority"], string> = {
  critical: "Critical", high: "High", medium: "Medium", low: "Low",
};
const PRIORITY_TONE: Record<CoverageRow["priority"], string> = {
  critical: "text-bad border-bad/50 font-semibold",
  high: "text-serious border-serious/40",
  medium: "text-warn border-warn/40",
  low: "text-muted border-line",
};

/**
 * What we actually hold per category, versus what a live integration needs —
 * shown per project so a thin section reads as "not indexed yet" rather than
 * a silent gap the reader has to notice on their own.
 */
export function DataCoveragePanel({ rows }: { rows: CoverageRow[] }) {
  const tracked = rows.filter((r) => r.status === "tracked").length;
  const partial = rows.filter((r) => r.status === "sparse" || r.status === "almost_empty").length;
  const missing = rows.filter((r) => r.status === "missing").length;

  // Preserve the order dataCoverage() emitted rather than re-sorting groups.
  const groups: { name: string; items: CoverageRow[] }[] = [];
  for (const r of rows) {
    const g = groups.find((x) => x.name === r.group);
    if (g) g.items.push(r); else groups.push({ name: r.group, items: [r] });
  }

  return (
    <SectionCard
      title="Data Coverage"
      right={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span><span className="num font-semibold text-good">{tracked}</span> tracked</span>
          <span><span className="num font-semibold text-warn">{partial}</span> partial</span>
          <span><span className="num font-semibold text-bad">{missing}</span> missing</span>
          <span className="text-faint">of {rows.length}</span>
        </span>
      }
    >
      <div className="scroll-x">
        <table className="itable">
          <thead>
            <tr>
              <th>Category</th>
              <th>Status</th>
              <th>Source</th>
              <th>Priority</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.name}>
                <tr>
                  <td colSpan={4} className="bg-surface2/60 !py-1.5 text-[10px] uppercase tracking-[0.09em] text-faint">
                    {g.name}
                  </td>
                </tr>
                {g.items.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <div className="text-[13px] font-medium text-ink">{r.label}</div>
                      <div className="mt-0.5 max-w-sm whitespace-normal text-[11px] leading-snug text-muted">
                        {r.detail}
                      </div>
                    </td>
                    <td>
                      <span
                        className="inline-flex items-center gap-1.5 whitespace-nowrap text-[12px] font-medium"
                        style={{ color: coverageColor(r.status) }}
                      >
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: coverageColor(r.status) }} />
                        {coverageLabel(r.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-[12px] text-ink2">{r.source}</td>
                    <td>
                      <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${PRIORITY_TONE[r.priority]}`}>
                        {PRIORITY_LABEL[r.priority]}
                      </span>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

// ------------------------------------------------------------------ insights

export function InsightList({ items }: { items: Insight[] }) {
  if (!items.length) {
    return <div className="px-4 py-6 text-center text-[13px] text-muted">No signals cross the reporting threshold yet.</div>;
  }
  return (
    <ul className="divide-y divide-grid">
      {items.map((o, i) => (
        <li key={i} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
          <span
            className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: o.tone === "good" ? "var(--good)" : o.tone === "bad" ? "var(--bad)" : "var(--ink-muted)" }}
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

export function HoldersPanel({ d, crossCounts }: {
  d: ProjectDetail; crossCounts?: Map<string, number>;
}) {
  const { project: p, topHolders, holderHistory, latest } = d;
  const hh = holderHistory.filter((h) => h.holder_count != null);
  const cur = hh.length ? hh[hh.length - 1].holder_count! : null;
  const supply = p.circulating_supply ?? p.total_supply;
  const avgWallet = cur && supply ? supply / cur : null;
  const avgUsd = avgWallet && latest?.price_usd ? avgWallet * latest.price_usd : null;

  const at = (daysAgo: number): number | null => {
    const target = Math.floor(Date.now() / 1000) - daysAgo * 86400;
    const prior = hh.filter((h) => h.ts <= target);
    return prior.length ? prior[prior.length - 1].holder_count! : null;
  };
  const chg = (daysAgo: number) => {
    const then = at(daysAgo);
    return then != null && cur != null ? cur - then : null;
  };
  const t10 = [...holderHistory].reverse().find((h) => h.top10_pct != null)?.top10_pct ?? null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Holder Base"
        right={<span className="text-[11px] text-muted">{hh.length} snapshot{hh.length === 1 ? "" : "s"} recorded</span>}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-4">
          <Metric label="Total Holders" value={fmtNum(cur)} />
          <Metric
            label="Net 7d"
            value={chg(7) != null ? <Delta v={at(7) ? (chg(7)! / at(7)!) * 100 : null} /> : "—"}
            sub={chg(7) != null ? `${chg(7)! >= 0 ? "+" : ""}${fmtNum(chg(7))} wallets` : "needs 7d of history"}
          />
          <Metric
            label="Net 30d"
            value={chg(30) != null ? <Delta v={at(30) ? (chg(30)! / at(30)!) * 100 : null} /> : "—"}
            sub={chg(30) != null ? `${chg(30)! >= 0 ? "+" : ""}${fmtNum(chg(30))} wallets` : "needs 30d of history"}
          />
          <Metric
            label="Avg Wallet"
            value={avgWallet ? fmtNum(avgWallet) : "—"}
            sub={avgUsd ? `${fmtUsd(avgUsd)} at spot` : "supply ÷ holders"}
          />
          <Metric
            label="Top 10 Concentration"
            value={t10 != null ? `${t10.toFixed(1)}%` : "—"}
            tone={t10 != null ? (t10 > 60 ? "bad" : t10 < 35 ? "good" : undefined) : undefined}
          />
          <Metric label="Circulating Supply" value={fmtNum(p.circulating_supply)} sub={p.total_supply ? `of ${fmtNum(p.total_supply)} total` : undefined} />
          <Metric
            label="Locked (Team)"
            value={fmtNum(p.team_package)}
            sub={p.team_package && p.total_supply ? `${((p.team_package / p.total_supply) * 100).toFixed(0)}% of supply` : undefined}
          />
          <Metric label="Market Cap / Holder" value={cur && latest?.mcap ? fmtUsd(latest.mcap / cur) : "—"} />
        </div>
      </SectionCard>

      <SectionCard title="Top Holders">
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
                  <th>#</th><th>Holder</th><th>Type</th>
                  <th className="!text-right">Balance</th>
                  <th className="!text-right">% Supply</th>
                  <th className="!text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {topHolders.map((h) => {
                  const owner = h.owner ?? h.address;
                  const value = latest?.price_usd ? h.amount * latest.price_usd : null;
                  const verdict = classifyWallet({
                    address: h.address, owner: h.owner,
                    treasuryAddress: p.treasury_address,
                    launchAddress: p.launch_address,
                    poolAddress: p.pool_address,
                    projectCount: crossCounts?.get(owner),
                    pct: h.pct,
                  });
                  const org = verdict ?? (h.label ? {
                    label: h.label, type: h.label, isOrganisation: true,
                    confidence: "confirmed" as const, reason: "Labelled from the wallet registry.",
                  } : null);
                  return (
                    <tr key={h.rank}>
                      <td className="num text-faint">{h.rank}</td>
                      <td>
                        <Link href={`/wallet/${owner}`} className="flex items-center gap-2 hover:text-accent">
                          <span className="num">{org?.isOrganisation ? org.label : shortAddr(owner)}</span>
                          {org?.isOrganisation && (
                            <span className="num text-[11px] text-faint">{shortAddr(owner)}</span>
                          )}
                        </Link>
                      </td>
                      <td>
                        {org ? (
                          <span
                            className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px]"
                            style={{ color: entityColor(org.type), background: "var(--surface-2)" }}
                            title={org.reason}
                          >
                            <span
                              className="h-1.5 w-1.5 rounded-full"
                              style={{ background: confidenceColor(org.confidence) }}
                            />
                            {org.isOrganisation ? org.type : "Individual?"}
                          </span>
                        ) : (
                          <span className="text-[11px] text-faint" title="No on-chain role, registry match or cross-project pattern found.">
                            Unidentified
                          </span>
                        )}
                      </td>
                      <td className="num text-right">{fmtNum(h.amount)}</td>
                      <td className="num text-right">{h.pct != null ? `${h.pct.toFixed(2)}%` : "—"}</td>
                      <td className="num text-right">{fmtUsd(value)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="border-t border-grid px-4 py-2.5 text-[11px] leading-relaxed text-faint">
              Organisations are identified by evidence, not inference alone: a green dot means a
              confirmed on-chain role or documented address, amber means a strong pattern
              (e.g. top-holder across several MetaDAO raises). Hover any badge for the reason.
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
  const whaleEvents = d.events.filter((e) => e.type === "whale_buy" || e.type === "whale_sell");
  return (
    <div className="space-y-5">
      <SectionCard title="Smart Money Flow">
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
              <li key={i} className="flex items-baseline gap-3 px-4 py-2.5 text-[13px]">
                <span className="num w-24 shrink-0 text-muted">{fmtDate(e.ts)}</span>
                <span className={e.type === "whale_buy" ? "text-good" : "text-bad"}>
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

export function TreasuryPanel({ d }: { d: ProjectDetail }) {
  const { project: p, treasuryValue, treasuryHistory, latest } = d;
  const vsRaise = treasuryValue && p.raise_amount_usd ? treasuryValue / p.raise_amount_usd : null;
  const vsMcap = treasuryValue && latest?.mcap ? treasuryValue / latest.mcap : null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Treasury"
        right={p.treasury_address ? (
          <a
            href={`https://solscan.io/account/${p.treasury_address}`}
            target="_blank" rel="noopener noreferrer"
            className="num text-[11px] text-accent hover:underline"
          >
            {shortAddr(p.treasury_address)} ↗
          </a>
        ) : undefined}
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-4">
          <Metric
            label="Current Value"
            value={treasuryValue != null && treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue)}
            sub="USDC AUM in the DAO vault"
          />
          <Metric label="Raised" value={p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd)} />
          <Metric
            label="Remaining vs Raise"
            value={vsRaise != null ? `${(vsRaise * 100).toFixed(0)}%` : "—"}
            tone={vsRaise != null ? (vsRaise > 0.7 ? "good" : vsRaise < 0.2 ? "bad" : undefined) : undefined}
          />
          <Metric
            label="Treasury / Mkt Cap"
            value={vsMcap != null ? `${(vsMcap * 100).toFixed(0)}%` : "—"}
            sub={vsMcap != null && vsMcap > 0.5 ? "backed above half of valuation" : undefined}
          />
        </div>
      </SectionCard>

      {treasuryHistory.length > 1 && (
        <SectionCard title="Treasury History">
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead><tr><th>Date</th><th className="!text-right">Value</th><th className="!text-right">Change</th></tr></thead>
              <tbody>
                {[...treasuryHistory].reverse().slice(0, 20).map((t, i, arr) => {
                  const prev = arr[i + 1];
                  const delta = prev && prev.value_usd ? ((t.value_usd! - prev.value_usd) / prev.value_usd) * 100 : null;
                  return (
                    <tr key={t.ts}>
                      <td className="num text-ink2">{fmtDate(t.ts)}</td>
                      <td className="num text-right">{fmtUsd(t.value_usd)}</td>
                      <td className="text-right"><Delta v={delta} /></td>
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
  const { project: p, latest, candles, ath, atl, athTs, holderHistory, treasuryValue } = d;
  const cur = latest?.price_usd ?? null;
  const roi = p.raise_price && cur ? ((cur - p.raise_price) / p.raise_price) * 100 : null;
  const athRet = p.raise_price && ath ? ((ath - p.raise_price) / p.raise_price) * 100 : null;
  const atlRet = p.raise_price && atl ? ((atl - p.raise_price) / p.raise_price) * 100 : null;
  const drawdown = ath && cur ? ((cur - ath) / ath) * 100 : null;
  const start = p.raise_end_ts ?? p.launch_ts ?? (candles.length ? candles[0].ts : null);
  const daysToAth = athTs && start ? Math.max(0, Math.round((athTs - start) / 86400)) : null;
  const hh = holderHistory.filter((h) => h.holder_count != null);
  const holdersNow = hh.length ? hh[hh.length - 1].holder_count : null;

  return (
    <SectionCard
      title="Performance Since Raise"
      right={p.raise_source_url ? (
        <a href={p.raise_source_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-accent hover:underline">
          raise source ↗
        </a>
      ) : undefined}
    >
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-4 py-4 md:grid-cols-4">
        <Metric label="Raise Price" value={p.raise_price != null ? fmtUsd(p.raise_price, { compact: false }) : "—"} />
        <Metric label="Current Price" value={fmtUsd(cur, { compact: false })} />
        <Metric label="ROI Since Raise" value={<Delta v={roi} />} />
        <Metric label="Current Drawdown" value={<Delta v={drawdown} />} sub="from all-time high" />
        <Metric label="ATH" value={fmtUsd(ath, { compact: false })} sub={athRet != null ? `${fmtPct(athRet)} vs raise` : undefined} />
        <Metric label="ATL" value={fmtUsd(atl, { compact: false })} sub={atlRet != null ? `${fmtPct(atlRet)} vs raise` : undefined} />
        <Metric label="Days to ATH" value={daysToAth != null ? `${daysToAth}d` : "—"} sub={athTs ? fmtDate(athTs) : undefined} />
        <Metric label="Treasury Remaining" value={treasuryValue != null && treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue)} />
        <Metric label="Contributors at Raise" value={fmtNum(p.raise_contributors)} />
        <Metric label="Holders Now" value={fmtNum(holdersNow)} />
        <Metric
          label="Committed"
          value={fmtUsd(p.raise_committed_usd)}
          sub={p.raise_committed_usd && p.raise_amount_usd ? `${Math.round(p.raise_committed_usd / p.raise_amount_usd)}× oversubscribed` : undefined}
        />
        <Metric label="Raise FDV" value={fmtUsd(p.raise_fdv_usd)} />
      </div>
      {p.raise_contributors == null && (
        <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
          Holders-at-launch and whale growth since the raise need a holder snapshot taken at launch;
          this platform began tracking later, so those deltas start from first ingest rather than from TGE.
        </p>
      )}
    </SectionCard>
  );
}

// -------------------------------------------------------------------- news

type FeedItem = { ts: number; title: string; url: string | null; source: string | null };

function FeedList({ items, showSource }: { items: FeedItem[]; showSource?: boolean }) {
  return (
    <ul className="divide-y divide-grid">
      {items.map((n, i) => (
        <li key={i} className="flex flex-wrap items-baseline gap-3 px-4 py-2.5 text-[13px]">
          <span className="num w-24 shrink-0 text-muted">{fmtDate(n.ts)}</span>
          {showSource && n.source && (
            <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink2">
              {n.source}
            </span>
          )}
          <span className="min-w-0 flex-1">
            {n.url
              ? <a href={n.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{n.title}</a>
              : n.title}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function NewsPanel({ items, releases = [], project }: {
  items: FeedItem[];
  releases?: FeedItem[];
  project: { twitter: string | null; website: string | null; github: string | null; docs: string | null };
}) {
  return (
    <div className="space-y-5">
      <SectionCard title="News & Announcements">
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
          right={
            <span className="text-[11px] text-muted">
              {releases.length} git tag{releases.length === 1 ? "" : "s"} · not press coverage
            </span>
          }
        >
          <FeedList items={releases} />
        </SectionCard>
      )}

      <SectionCard title="Official Channels">
        <div className="flex flex-wrap gap-3 px-4 py-4 text-[13px]">
          {([["Website", project.website], ["X / Twitter", project.twitter], ["GitHub", project.github], ["Docs", project.docs]] as const)
            .filter(([, u]) => u)
            .map(([label, url]) => (
              <a
                key={label} href={url!} target="_blank" rel="noopener noreferrer"
                className="rounded border border-line px-2.5 py-1 text-ink2 hover:border-accent/50 hover:text-accent"
              >
                {label} ↗
              </a>
            ))}
          {!project.website && !project.twitter && !project.github && !project.docs && (
            <span className="text-muted">No official links indexed.</span>
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// ---------------------------------------------------------------- research

export function ResearchPanel({ memo }: { memo: Memo }) {
  const List = ({ items, tone }: { items: string[]; tone?: "good" | "bad" }) => (
    <ul className="space-y-2 px-4 py-3.5">
      {items.map((s, i) => (
        <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed text-ink2">
          <span
            className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: tone === "good" ? "var(--good)" : tone === "bad" ? "var(--bad)" : "var(--ink-muted)" }}
          />
          <span>{s}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-5">
      <SectionCard title="Executive Summary">
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">{memo.summary}</p>
      </SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Bull Case"><List items={memo.bull} tone="good" /></SectionCard>
        <SectionCard title="Bear Case"><List items={memo.bear} tone="bad" /></SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Strengths">
          {memo.strengths.length ? <List items={memo.strengths} tone="good" />
            : <p className="px-4 py-3.5 text-[13px] text-muted">None identified from the indexed metrics.</p>}
        </SectionCard>
        <SectionCard title="Weaknesses">
          {memo.weaknesses.length ? <List items={memo.weaknesses} tone="bad" />
            : <p className="px-4 py-3.5 text-[13px] text-muted">None identified from the indexed metrics.</p>}
        </SectionCard>
      </div>

      <SectionCard title="Risks"><List items={memo.risks} tone="bad" /></SectionCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard title="Momentum">
          <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">{memo.momentum}</p>
        </SectionCard>
        <SectionCard title="Competition">
          <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">{memo.competition}</p>
        </SectionCard>
      </div>

      {memo.developments.length > 0 && (
        <SectionCard title="Recent Developments"><List items={memo.developments} /></SectionCard>
      )}

      <SectionCard title="Long-term Outlook">
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">{memo.outlook}</p>
      </SectionCard>

      <p className="text-[11px] leading-relaxed text-muted">
        This memo is generated from indexed on-chain and public data at page load. Every claim
        restates a measured figure shown elsewhere on this page — it contains no forecasts and is
        not investment advice.
      </p>
    </div>
  );
}

// -------------------------------------------------------------- governance

export function GovernancePanel({ d }: { d: ProjectDetail }) {
  const { proposals, project: p } = d;
  return (
    <div className="space-y-5">
      <SectionCard title="Proposals" right={<span className="text-[11px] text-muted">{proposals.length} indexed</span>}>
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
              <thead><tr><th>#</th><th>Proposal</th><th>State</th><th className="!text-right">Date</th></tr></thead>
              <tbody>
                {proposals.map((pr, i) => (
                  <tr key={i}>
                    <td className="num text-muted">{pr.number ?? "—"}</td>
                    <td className="max-w-[420px] truncate">
                      {pr.url ? <a href={pr.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{pr.title ?? "Proposal"}</a> : (pr.title ?? "Proposal")}
                    </td>
                    <td><StatusBadge status={pr.state} /></td>
                    <td className="num text-right text-ink2">{fmtDate(pr.created_ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Governance Model">
        <p className="px-4 py-3.5 text-[13px] leading-relaxed text-ink2">
          {p.name} is governed by MetaDAO futarchy: proposals are decided by conditional prediction
          markets rather than token votes. Each proposal spawns pass and fail markets, and the
          outcome is determined by which market prices the token higher — so the treasury is
          steered by traders forecasting value, not by turnout.
        </p>
      </SectionCard>
    </div>
  );
}

// ----------------------------------------------------------------- timeline

export function TimelinePanel({ events }: {
  events: { ts: number; type: string; title: string; detail: string | null; url: string | null }[];
}) {
  if (!events.length) {
    return <div className="card px-4 py-8 text-center text-[13px] text-muted">No events indexed yet.</div>;
  }
  return (
    <div className="card">
      <ul className="divide-y divide-grid">
        {events.map((e, i) => (
          <li key={i} className="flex gap-4 px-4 py-3">
            <span className="num w-24 shrink-0 pt-0.5 text-[12px] text-muted">{fmtDate(e.ts)}</span>
            <span className="relative flex w-3 shrink-0 justify-center">
              <span className="absolute top-1.5 h-2 w-2 rounded-full bg-accent" />
              {i < events.length - 1 && <span className="absolute top-4 bottom-[-14px] w-px bg-grid" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink2">
                  {e.type.replace(/_/g, " ")}
                </span>
                <span className="text-[13px]">
                  {e.url ? <a href={e.url} target="_blank" rel="noopener noreferrer" className="hover:text-accent">{e.title}</a> : e.title}
                </span>
                <span className="ml-auto text-[11px] text-muted">{timeAgo(e.ts)}</span>
              </div>
              {e.detail && <p className="mt-0.5 text-[12px] text-ink2">{e.detail}</p>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
