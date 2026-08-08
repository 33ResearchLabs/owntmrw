import Link from "next/link";
import { db } from "@/lib/db";
import { entityColor } from "@/lib/sources/wallets";
import { classifyWallet, confidenceColor } from "@/lib/orgs";
import { SectionCard, Metric, DataGap } from "@/components/panels";
import { BarList } from "@/components/ui";
import { fmtUsd, fmtNum, shortAddr, timeAgo } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Holding {
  slug: string; name: string; symbol: string | null; image_url: string | null;
  amount: number; pct: number | null; label: string | null; rank: number;
  price_usd: number | null; ts: number | null;
}

/** A project account this address *is*, rather than one it merely holds. */
interface Role {
  slug: string;
  name: string;
  role: "DAO Treasury" | "Launch Vault" | "Team Package" | "Futarchy AMM" | "Meteora LP" | "Liquidity Pool";
}

/** Which EntityType colours each role chip. */
const ROLE_TYPE: Record<Role["role"], string> = {
  "DAO Treasury": "Treasury",
  "Launch Vault": "Protocol",
  "Team Package": "Team",
  "Futarchy AMM": "Liquidity Pool",
  "Meteora LP": "Liquidity Pool",
  "Liquidity Pool": "Liquidity Pool",
};

export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const d = db();

  // Every MetaDAO project where this wallet appears in the indexed holder list.
  const holdings = d.prepare(`
    SELECT p.slug, p.name, p.symbol, p.image_url,
           th.amount, th.pct, th.label, th.rank, th.ts,
           (SELECT ps.price_usd FROM price_snapshots ps
             WHERE ps.project_id = p.id ORDER BY ps.ts DESC LIMIT 1) AS price_usd
    FROM top_holders th JOIN projects p ON p.id = th.project_id
    WHERE th.owner = ? OR th.address = ?
    ORDER BY th.pct DESC NULLS LAST
  `).all(address, address) as Holding[];

  // Protocol accounts the address *is*. This is the strongest identity signal
  // available and the page previously ignored it entirely, so a project's own
  // treasury vault rendered here as an unlabelled wallet.
  const roles = d.prepare(`
    SELECT slug, name,
      CASE WHEN treasury_address  = ? THEN 'DAO Treasury'
           WHEN launch_address    = ? THEN 'Launch Vault'
           WHEN team_address      = ? THEN 'Team Package'
           WHEN amm_vault_address = ? THEN 'Futarchy AMM'
           WHEN lp_pool_address   = ? THEN 'Meteora LP'
           ELSE 'Liquidity Pool' END AS role
    FROM projects
    WHERE treasury_address = ? OR launch_address = ? OR pool_address = ?
       OR team_address = ? OR amm_vault_address = ? OR lp_pool_address = ?
    ORDER BY name
  `).all(...Array(11).fill(address)) as Role[];

  const has = (r: Role["role"]) => roles.some((x) => x.role === r);
  const largestPct = holdings.reduce((m, h) => Math.max(m, h.pct ?? 0), 0);
  const venueLabel = holdings.find((h) => h.label)?.label ?? null;

  // One identity routine for the whole app: the verdict a project's holder
  // table shows for this address is the verdict its own page shows.
  const verdict = classifyWallet({
    address,
    treasuryAddress: has("DAO Treasury") ? address : null,
    launchAddress: has("Launch Vault") ? address : null,
    poolAddress: has("Liquidity Pool") ? address : null,
    teamAddress: has("Team Package") ? address : null,
    ammVaultAddress: has("Futarchy AMM") ? address : null,
    lpPoolAddress: has("Meteora LP") ? address : null,
    pct: largestPct || null,
    venueLabel,
  });

  const totalValue = holdings.reduce(
    (s, h) => s + (h.price_usd ? h.amount * h.price_usd : 0), 0
  );
  const derivedLabel = verdict?.label ?? venueLabel;
  const derivedType = verdict?.type ?? null;
  const firstSeen = holdings.reduce<number | null>(
    (m, h) => (h.ts == null ? m : m == null ? h.ts : Math.min(m, h.ts)), null
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start gap-4">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface2 text-[15px] font-semibold text-ink2">
          {address.slice(0, 2).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="num text-[20px] font-semibold tracking-tight">
              {derivedLabel ?? shortAddr(address)}
            </h1>
            {derivedType && (
              <span
                className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px]"
                style={{ color: entityColor(derivedType), background: "var(--surface-2)" }}
              >
                {verdict && (
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ background: confidenceColor(verdict.confidence) }}
                    title={`${verdict.confidence} identification`}
                  />
                )}
                {derivedType}
              </span>
            )}
          </div>
          {/* Never assert an identity without the evidence for it — the same
              rule the project-page holder table follows. */}
          {verdict && (
            <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-muted">
              {verdict.reason}
            </p>
          )}
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="num break-all text-muted">{address}</span>
            <a
              href={`https://solscan.io/account/${address}`}
              target="_blank" rel="noopener noreferrer"
              className="shrink-0 text-brand hover:underline"
            >
              Solscan ↗
            </a>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <div className="card px-4 py-3">
          <Metric label="MetaDAO Positions" value={holdings.length || "—"} />
        </div>
        <div className="card px-4 py-3">
          <Metric label="Indexed Value" value={totalValue > 0 ? fmtUsd(totalValue) : "—"} sub="across tracked projects" />
        </div>
        <div className="card px-4 py-3">
          <Metric
            label="Largest Position"
            value={holdings[0]?.pct != null ? `${holdings[0].pct.toFixed(2)}%` : "—"}
            sub={holdings[0]?.name}
          />
        </div>
        <div className="card px-4 py-3">
          <Metric
            label="Entity"
            value={derivedType ?? "Unlabelled"}
            sub={verdict ? `${verdict.confidence} identification` : "no matching evidence"}
          />
        </div>
      </div>

      {roles.length > 0 && (
        <SectionCard
          title="On-chain Roles"
          right={<span className="text-[11px] text-muted">confirmed from MetaDAO allocation data</span>}
        >
          <ul className="divide-y divide-grid">
            {roles.map((r) => (
              <li key={`${r.slug}-${r.role}`} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-2.5">
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[11px]"
                  style={{ color: entityColor(ROLE_TYPE[r.role]), background: "var(--surface-2)" }}
                >
                  {r.role}
                </span>
                <span className="text-[13px]">of</span>
                <Link href={`/project/${r.slug}`} className="text-[13px] font-medium hover:text-brand">
                  {r.name}
                </Link>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {holdings.filter((h) => h.pct != null).length >= 2 && (
        <SectionCard
          title="Position Sizes"
          right={<span className="text-[11px] text-muted">share of each token&rsquo;s supply</span>}
        >
          <BarList
            labelWidth={170}
            items={holdings
              .filter((h) => h.pct != null)
              .map((h) => ({
                key: h.slug,
                label: h.name,
                value: h.pct!,
                display: `${h.pct!.toFixed(2)}%`,
                href: `/project/${h.slug}`,
                title: `Rank #${h.rank} holder of ${h.name}`,
              }))}
          />
        </SectionCard>
      )}

      <SectionCard
        title="Related Projects"
        right={
          <span className="text-[11px] text-muted">
            {firstSeen ? `first indexed ${timeAgo(firstSeen)}` : "MetaDAO holdings"}
          </span>
        }
      >
        {holdings.length === 0 ? (
          <div className="p-4">
            <DataGap
              title="This wallet does not appear in any indexed holder list"
              why="Holder lists are only populated when a keyed Solana RPC is configured, since public endpoints refuse the calls that enumerate a mint's holders. Without them, cross-project wallet linkage cannot be built."
              unlock="Set SOLANA_RPC_URL and re-run npm run ingest."
            />
          </div>
        ) : (
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead>
                <tr>
                  <th>Project</th><th>Label</th>
                  <th className="!text-right">Rank</th>
                  <th className="!text-right">Balance</th>
                  <th className="!text-right">% Supply</th>
                  <th className="!text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.slug}>
                    <td>
                      <Link href={`/project/${h.slug}`} className="hover:text-brand">
                        {h.name}{h.symbol ? <span className="ml-1.5 text-[11px] text-muted">{h.symbol}</span> : null}
                      </Link>
                    </td>
                    <td>{h.label ?? <span className="text-muted">—</span>}</td>
                    <td className="num text-right text-muted">#{h.rank}</td>
                    <td className="num text-right">{fmtNum(h.amount)}</td>
                    <td className="num text-right">{h.pct != null ? `${h.pct.toFixed(2)}%` : "—"}</td>
                    <td className="num text-right">{h.price_usd ? fmtUsd(h.amount * h.price_usd) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <DataGap
        title="Realised PnL, win rate, hold duration and transaction history"
        why="These require the wallet's complete transaction history — every buy, sell and transfer with its price at execution. Reconstructing cost basis without those trades would mean inventing numbers."
        unlock="A keyed RPC with getSignaturesForAddress, or a parsed-transaction indexer such as Helius."
      />
    </div>
  );
}
