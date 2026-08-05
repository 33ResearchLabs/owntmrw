import type { Project } from "@/lib/db";
import type { HealthScore } from "@/lib/analytics";
import { scoreColor } from "@/lib/analytics";
import { raisePriceOf } from "@/lib/queries";
import { fmtUsd, fmtPrice, fmtNum, fmtDate, shortAddr } from "@/lib/format";

/**
 * The project's identity card: what it is, who runs it, when it launched and
 * where to verify each claim. Every row links out to a primary source so a
 * reader can check the platform rather than trust it.
 */
export function ProjectFacts({
  p, hs, treasuryValue, holders,
}: {
  p: Project; hs: HealthScore; treasuryValue: number | null; holders: number | null;
}) {
  const rows: [string, React.ReactNode][] = [];

  if (p.category) rows.push(["Category", p.category]);
  if (p.raise_track) rows.push(["Launch track", <span className="capitalize">{p.raise_track}</span>]);
  if (p.raise_end_ts) rows.push(["Raise closed", fmtDate(p.raise_end_ts)]);
  if (p.launch_ts) rows.push(["Trading began", fmtDate(p.launch_ts)]);
  if (p.raise_amount_usd != null) {
    rows.push(["Raised", p.raise_amount_usd === 0 ? "$0 (refunded)" : fmtUsd(p.raise_amount_usd)]);
  }
  const rp = raisePriceOf(p);
  if (rp) rows.push(["Raise price", `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`]);
  if (p.raise_contributors != null) rows.push(["Contributors", fmtNum(p.raise_contributors)]);
  if (treasuryValue != null) {
    rows.push(["Treasury", treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue)]);
  }
  if (holders != null) rows.push(["Holders", fmtNum(holders)]);
  if (p.circulating_supply != null) {
    rows.push([
      "Float",
      p.total_supply
        ? `${((p.circulating_supply / p.total_supply) * 100).toFixed(0)}% of supply`
        : fmtNum(p.circulating_supply),
    ]);
  }

  const links: [string, string | null][] = [
    ["Website", p.website], ["X", p.twitter], ["Discord", p.discord],
    ["Telegram", p.telegram], ["GitHub", p.github], ["Docs", p.docs],
  ];
  const present = links.filter(([, u]) => u);

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-grid px-4 py-3">
        <h3 className="text-[14px] font-semibold">About {p.name}</h3>
        {hs.overall != null && (
          <span
            className="num rounded-md px-2 py-0.5 text-[12px] font-bold"
            style={{ color: scoreColor(hs.overall), background: "var(--surface-2)" }}
            title={`Composite health across ${hs.measured} measured dimensions`}
          >
            {hs.overall}
          </span>
        )}
      </div>

      {p.description && (
        <p className="border-b border-grid px-4 py-3 text-[12.5px] leading-relaxed text-ink2">
          {p.description}
        </p>
      )}

      <dl className="px-4 py-1">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-grid py-2.5 last:border-b-0">
            <dt className="text-[12px] text-muted">{k}</dt>
            <dd className="num text-right text-[12.5px] font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {p.mint && (
        <div className="border-t border-grid px-4 py-3">
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.08em] text-faint">Token mint</div>
          <a
            href={`https://solscan.io/token/${p.mint}`}
            target="_blank" rel="noopener noreferrer"
            className="num text-[12px] text-ink2 transition-colors hover:text-accent"
            title={p.mint}
          >
            {shortAddr(p.mint)} ↗
          </a>
        </div>
      )}

      {p.treasury_address && (
        <div className="border-t border-grid px-4 py-3">
          <div className="mb-1 text-[10.5px] uppercase tracking-[0.08em] text-faint">Treasury vault</div>
          <a
            href={`https://solscan.io/account/${p.treasury_address}`}
            target="_blank" rel="noopener noreferrer"
            className="num text-[12px] text-ink2 transition-colors hover:text-accent"
            title={p.treasury_address}
          >
            {shortAddr(p.treasury_address)} ↗
          </a>
        </div>
      )}

      {present.length > 0 && (
        <div className="border-t border-grid px-4 py-3">
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-faint">Official channels</div>
          <div className="flex flex-wrap gap-1.5">
            {present.map(([label, url]) => (
              <a
                key={label} href={url!} target="_blank" rel="noopener noreferrer"
                className="rounded-lg border border-line px-2 py-1 text-[11.5px] text-ink2 transition-colors hover:border-accent/50 hover:text-accent"
              >
                {label} ↗
              </a>
            ))}
          </div>
        </div>
      )}

      {p.raise_source_url && (
        <div className="border-t border-grid px-4 py-2.5">
          <a
            href={p.raise_source_url} target="_blank" rel="noopener noreferrer"
            className="text-[11px] text-muted transition-colors hover:text-accent"
          >
            Raise figures source ↗
          </a>
        </div>
      )}
    </div>
  );
}
