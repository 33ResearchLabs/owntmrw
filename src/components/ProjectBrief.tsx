import type { ProjectDetail } from "@/lib/queries";
import { fmtUsd, fmtNum, fmtPct, fmtDate } from "@/lib/format";

interface Tile {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "accent";
  /** Large feature tile spanning two columns. */
  wide?: boolean;
}

/**
 * The readable brief: everything the platform knows about a project as a wall
 * of stat tiles, grouped into The Raise / The Token / The DAO. Tiles with no
 * data are omitted — no dashes, no filler.
 */
export function ProjectBrief({ d }: { d: ProjectDetail }) {
  const { project: p, latest, candles, holderHistory, treasuryValue, github, ath, athTs } = d;

  const holders = holderHistory.filter((h) => h.holder_count != null);
  const holderCount = holders.length ? holders[holders.length - 1].holder_count : null;
  const cur = latest?.price_usd ?? null;
  const roi = p.raise_price && cur ? ((cur - p.raise_price) / p.raise_price) * 100 : null;
  const oversub = p.raise_committed_usd && p.raise_amount_usd && p.raise_amount_usd > 0
    ? p.raise_committed_usd / p.raise_amount_usd : null;
  const lockedPct = p.team_package && p.total_supply ? (p.team_package / p.total_supply) * 100 : null;
  const floatPct = p.circulating_supply && p.total_supply
    ? (p.circulating_supply / p.total_supply) * 100 : null;
  const athRet = p.raise_price && ath ? ((ath - p.raise_price) / p.raise_price) * 100 : null;
  const treasuryVsRaise = treasuryValue != null && p.raise_amount_usd
    ? (treasuryValue / p.raise_amount_usd) * 100 : null;

  const groups: { title: string; tiles: Tile[] }[] = [
    {
      title: "The Raise",
      tiles: [
        p.raise_amount_usd != null && {
          label: "Raised",
          value: p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd),
          sub: p.raise_amount_usd === 0
            ? "failed — fully refunded"
            : p.raise_end_ts ? `closed ${fmtDate(p.raise_end_ts)}` : undefined,
          tone: p.raise_amount_usd === 0 ? ("bad" as const) : ("accent" as const),
          wide: true,
        },
        p.raise_committed_usd != null && {
          label: "Demand",
          value: fmtUsd(p.raise_committed_usd),
          sub: oversub != null
            ? `${oversub < 10 ? oversub.toFixed(1) : Math.round(oversub)}× oversubscribed`
            : "committed",
        },
        p.raise_price != null && {
          label: "Raise Price",
          value: fmtUsd(p.raise_price, { compact: false }),
        },
        p.raise_fdv_usd != null && {
          label: "Raise Valuation",
          value: fmtUsd(p.raise_fdv_usd),
        },
        p.raise_contributors != null && {
          label: "Contributors",
          value: fmtNum(p.raise_contributors),
        },
        p.raise_track != null && {
          label: "Track",
          value: p.raise_track === "curated" ? "Curated" : "Permissionless",
          sub: p.raise_track === "curated" ? "MetaDAO launchpad" : "via Futard",
        },
      ].filter(Boolean) as Tile[],
    },
    {
      title: "The Token",
      tiles: [
        roi != null && {
          label: "Return vs Raise",
          value: fmtPct(roi),
          sub: athRet != null ? `peaked at ${fmtPct(athRet)}` : undefined,
          tone: roi >= 0 ? ("good" as const) : ("bad" as const),
          wide: true,
        },
        ath != null && {
          label: "All-Time High",
          value: fmtUsd(ath, { compact: false }),
          sub: athTs ? fmtDate(athTs) : undefined,
        },
        floatPct != null && {
          label: "Tradeable Float",
          value: `${floatPct.toFixed(0)}%`,
          sub: "of total supply",
        },
        lockedPct != null && lockedPct > 0 && {
          label: "Team Lock",
          value: `${lockedPct.toFixed(0)}%`,
          sub: "price-milestone unlocks",
        },
        candles.length > 0 && {
          label: "Trading Since",
          value: fmtDate(candles[0].ts),
        },
      ].filter(Boolean) as Tile[],
    },
    {
      title: "The DAO",
      tiles: [
        treasuryValue != null && {
          label: "Treasury",
          value: treasuryValue < 1 ? "~$0" : fmtUsd(treasuryValue),
          sub: treasuryValue < 1
            ? "vault is empty"
            : treasuryVsRaise != null
              ? `${treasuryVsRaise.toFixed(0)}% of the raise still held`
              : "USDC on-chain",
          tone: treasuryValue < 1 ? ("bad" as const) : ("good" as const),
          wide: true,
        },
        holderCount != null && {
          label: "Holders",
          value: fmtNum(holderCount),
        },
        latest?.liquidity_usd != null && {
          label: "Liquidity",
          value: fmtUsd(latest.liquidity_usd),
        },
        github?.stars != null && {
          label: "Open Source",
          value: `★ ${fmtNum(github.stars)}`,
          sub: `${github.repos ?? "?"} public repos`,
        },
        {
          label: "Governance",
          value: "Futarchy",
          sub: "markets decide, not votes",
        },
      ].filter(Boolean) as Tile[],
    },
  ];

  const toneCls = (t?: Tile["tone"]) =>
    t === "good" ? "text-good" : t === "bad" ? "text-bad" : t === "accent" ? "text-accent" : "";

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-[18px] font-bold">About {p.name}</h2>
        {p.raise_source_url && (
          <a
            href={p.raise_source_url} target="_blank" rel="noopener noreferrer"
            className="text-[12px] text-faint transition-colors hover:text-accent"
          >
            figures source ↗
          </a>
        )}
      </div>

      {p.description && (
        <div className="card mb-4 px-6 py-5">
          <p className="max-w-4xl text-[13.5px] leading-relaxed text-ink2">{p.description}</p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.filter((g) => g.tiles.length).map((g) => (
          <div key={g.title} className="card overflow-hidden">
            <div className="flex items-center gap-2 border-b border-grid px-5 py-3">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              <h3 className="text-[12px] font-bold uppercase tracking-[0.09em] text-ink2">{g.title}</h3>
            </div>
            <div className="grid grid-cols-2 gap-px bg-grid">
              {g.tiles.map((t, i) => {
                // Make the last tile span both columns when the narrow tiles
                // are odd-numbered, so the hairline grid has no bare cells.
                const narrowAfter = g.tiles.slice(0, i).filter((x) => !x.wide).length;
                const narrowTotal = g.tiles.filter((x) => !x.wide).length;
                const stretch = !t.wide && narrowTotal % 2 === 1 && narrowAfter === narrowTotal - 1;
                return (
                <div
                  key={t.label}
                  className={`group bg-surface px-5 py-4 transition-colors hover:bg-surface2 ${t.wide || stretch ? "col-span-2" : ""}`}
                >
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-faint">{t.label}</div>
                  <div
                    className={`num mt-1 font-extrabold tracking-tight ${t.wide ? "text-[24px]" : "text-[17px]"} ${toneCls(t.tone)}`}
                  >
                    {t.value}
                  </div>
                  {t.sub && <div className="mt-0.5 text-[11.5px] text-muted">{t.sub}</div>}
                </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {p.raise_note && (
        <p className="mt-4 rounded-xl border border-line bg-surface px-5 py-3.5 text-[12px] leading-relaxed text-muted">
          {p.raise_note}
        </p>
      )}
    </section>
  );
}
