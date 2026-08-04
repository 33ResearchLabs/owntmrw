import Link from "next/link";
import { db } from "@/lib/db";
import { labelFor, entityColor } from "@/lib/sources/wallets";
import { SectionCard, Metric, DataGap } from "@/components/panels";
import { fmtUsd, fmtNum, shortAddr } from "@/lib/format";

export const dynamic = "force-dynamic";

interface Holding {
  slug: string; name: string; symbol: string | null; image_url: string | null;
  amount: number; pct: number | null; label: string | null; rank: number;
  price_usd: number | null;
}

export default async function WalletPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  const d = db();

  // Every MetaDAO project where this wallet appears in the indexed holder list.
  const holdings = d.prepare(`
    SELECT p.slug, p.name, p.symbol, p.image_url,
           th.amount, th.pct, th.label, th.rank,
           (SELECT ps.price_usd FROM price_snapshots ps
             WHERE ps.project_id = p.id ORDER BY ps.ts DESC LIMIT 1) AS price_usd
    FROM top_holders th JOIN projects p ON p.id = th.project_id
    WHERE th.owner = ? OR th.address = ?
    ORDER BY th.pct DESC NULLS LAST
  `).all(address, address) as Holding[];

  const known = labelFor(address);
  const totalValue = holdings.reduce(
    (s, h) => s + (h.price_usd ? h.amount * h.price_usd : 0), 0
  );
  const derivedLabel = known?.label ?? holdings.find((h) => h.label)?.label ?? null;
  const derivedType = known?.type ?? (holdings.find((h) => h.label)?.label ?? null);

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
                className="rounded px-1.5 py-0.5 text-[11px]"
                style={{ color: entityColor(derivedType), background: "var(--surface-2)" }}
              >
                {derivedType}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[12px]">
            <span className="num break-all text-muted">{address}</span>
            <a
              href={`https://solscan.io/account/${address}`}
              target="_blank" rel="noopener noreferrer"
              className="shrink-0 text-accent hover:underline"
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
          <Metric label="Entity" value={derivedType ?? "Unlabelled"} />
        </div>
      </div>

      <SectionCard title="Related Projects" right={<span className="text-[11px] text-muted">MetaDAO holdings</span>}>
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
                      <Link href={`/project/${h.slug}`} className="hover:text-accent">
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
