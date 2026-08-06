import { raisePriceOf, type ProjectDetail } from "@/lib/queries";
import { fmtUsd, fmtNum, fmtPct, fmtDate, fmtPrice, timeAgo } from "@/lib/format";
import { IconBadge, Sparkline, MeterBar, Icon, type IconName } from "./viz";

interface Tile {
  label: string;
  value: string;
  sub?: string;
  tone?: "good" | "bad" | "accent";
  /** Large feature tile spanning two columns. */
  wide?: boolean;
  /** Rendered under the value on the feature tile. */
  extra?: React.ReactNode;
  /** Sits beside the value on the feature tile. */
  aside?: React.ReactNode;
  /** Small confirmation chip beside the value. */
  badge?: string;
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
  const rp = raisePriceOf(p);
  const roi = rp && cur ? ((cur - rp.usd) / rp.usd) * 100 : null;
  const oversub = p.raise_committed_usd && p.raise_amount_usd && p.raise_amount_usd > 0
    ? p.raise_committed_usd / p.raise_amount_usd : null;
  const lockedPct = p.team_package && p.total_supply ? (p.team_package / p.total_supply) * 100 : null;
  const floatPct = p.circulating_supply && p.total_supply
    ? (p.circulating_supply / p.total_supply) * 100 : null;
  const athRet = rp && ath ? ((ath - rp.usd) / rp.usd) * 100 : null;
  const treasuryVsRaise = treasuryValue != null && p.raise_amount_usd
    ? (treasuryValue / p.raise_amount_usd) * 100 : null;

  // MetaDAO and Flash.Trade never ran a public launchpad sale — raise_track is
  // only set for tokens that did — so demand, per-token price, valuation and
  // contributor counts were never public figures to show, not data ingest
  // missed. Left silent, the card renders one tile in a grid built for six and
  // reads as broken; the note fills that space with the reason instead.
  const raiseIsPrivate = !p.raise_track;

  const groups: { title: string; icon: IconName; color: string; tiles: Tile[]; note?: string }[] = [
    {
      title: "The Raise",
      icon: "chart",
      color: "var(--accent)",
      note: raiseIsPrivate
        ? (p.raise_note ??
          "Not a launchpad sale — demand, per-token price, valuation and contributor figures were never public for this raise.")
        : undefined,
      tiles: [
        p.raise_amount_usd != null && {
          label: "Raised",
          value: p.raise_amount_usd === 0 ? "$0" : fmtUsd(p.raise_amount_usd),
          sub: p.raise_amount_usd === 0
            ? "failed — fully refunded"
            : p.raise_end_ts ? `closed ${fmtDate(p.raise_end_ts)}` : undefined,
          tone: p.raise_amount_usd === 0 ? ("bad" as const) : ("accent" as const),
          wide: true,
          badge: p.raise_amount_usd === 0 ? "Refunded" : p.raise_end_ts ? "Completed" : undefined,
        },
        p.raise_committed_usd != null && {
          label: "Demand",
          value: fmtUsd(p.raise_committed_usd),
          sub: oversub != null
            ? `${oversub < 10 ? oversub.toFixed(1) : Math.round(oversub)}× oversubscribed`
            : "committed",
        },
        rp != null && {
          label: "Raise Price",
          value: `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}`,
          sub: rp.derived ? "raise ÷ 10M sold" : undefined,
        },
        p.raise_fdv_usd != null && {
          label: "Raise Valuation",
          value: fmtUsd(p.raise_fdv_usd),
        },
        p.raise_contributors != null && {
          label: "Contributors",
          value: fmtNum(p.raise_contributors),
        },
        // A raise with money but no launchpad track was a private round, and
        // "Private" is its track, not a gap. Gated on the amount so a token
        // that never raised at all (Flash.Trade) doesn't inherit the label.
        (p.raise_track != null || (p.raise_amount_usd != null && p.raise_amount_usd > 0)) && {
          label: "Track",
          value:
            p.raise_track === "curated" ? "Curated"
            : p.raise_track === "permissionless" ? "Permissionless"
            : "Private",
          sub:
            p.raise_track === "curated" ? "MetaDAO launchpad"
            : p.raise_track === "permissionless" ? "via Futard"
            : "off-launchpad round",
        },
      ].filter(Boolean) as Tile[],
    },
    {
      title: "The Token",
      icon: "token",
      color: "var(--good)",
      tiles: [
        roi != null && {
          label: "Return vs Raise",
          value: fmtPct(roi),
          sub: athRet != null ? `peaked at ${fmtPct(athRet)}` : undefined,
          tone: roi >= 0 ? ("good" as const) : ("bad" as const),
          wide: true,
          // The price path behind the number. Falls back to a "needs history"
          // rule when the token is too young to have a shape worth plotting.
          aside: (
            <div className="w-[42%] max-w-[190px] shrink-0">
              <Sparkline values={candles.map((c) => c.c)} height={38} />
            </div>
          ),
        },
        ath != null && {
          label: "All-Time High",
          value: fmtPrice(ath),
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
      icon: "bank",
      color: "#9b7ae0",
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
          // Runway against the raise, which is the only reference point that
          // makes an absolute treasury figure mean anything.
          extra: treasuryVsRaise != null ? (
            <div className="mt-2.5">
              <MeterBar
                pct={Math.min(100, treasuryVsRaise)}
                color={treasuryVsRaise > 70 ? "var(--good)" : treasuryVsRaise < 20 ? "var(--bad)" : "var(--warn)"}
              />
            </div>
          ) : undefined,
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

  // The three figures worth restating beside the note, each only when real.
  const footStats = [
    p.raise_contributors != null && {
      label: "Contributors", value: fmtNum(p.raise_contributors),
      icon: "users" as IconName, color: "var(--accent)",
    },
    oversub != null && {
      label: "Oversubscribed",
      value: `${oversub < 10 ? oversub.toFixed(1) : Math.round(oversub)}×`,
      icon: "pie" as IconName, color: "var(--good)",
    },
    p.raise_fdv_usd != null && {
      label: "Raise Valuation", value: fmtUsd(p.raise_fdv_usd),
      icon: "shield" as IconName, color: "#9b7ae0",
    },
  ].filter(Boolean) as { label: string; value: string; icon: IconName; color: string }[];

  const toneCls = (t?: Tile["tone"]) =>
    t === "good" ? "text-good" : t === "bad" ? "text-bad" : t === "accent" ? "text-accent" : "";

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[18px] font-bold">About {p.name}</h2>
          <p className="mt-0.5 text-[12.5px] text-muted">
            Key fundraising, tokenomics and governance data at a glance.
          </p>
        </div>
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
            <div className="flex items-center gap-2.5 border-b border-grid px-5 py-3.5">
              <IconBadge name={g.icon} color={g.color} size={28} />
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
                  <div className="flex items-end justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`num mt-1 font-extrabold tracking-tight ${t.wide ? "text-[24px]" : "text-[17px]"} ${toneCls(t.tone)}`}
                        >
                          {t.value}
                        </span>
                        {t.badge && (
                          <span className="mt-1 rounded-md border border-line px-1.5 py-0.5 text-[10px] text-ink2">
                            {t.badge}
                          </span>
                        )}
                      </div>
                      {t.sub && <div className="mt-0.5 text-[11.5px] text-muted">{t.sub}</div>}
                    </div>
                    {t.aside}
                  </div>
                  {t.extra}
                </div>
                );
              })}
            </div>
            {g.note && (
              <p className="border-t border-grid px-5 py-3 text-[11.5px] leading-relaxed text-muted">
                {g.note}
              </p>
            )}
          </div>
        ))}
      </div>

      {((p.raise_note && !raiseIsPrivate) || footStats.length > 0) && (
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4 lg:flex-row lg:items-center">
          {p.raise_note && !raiseIsPrivate && (
            <div className="flex min-w-0 flex-1 gap-3">
              <span className="mt-0.5 shrink-0 text-muted"><Icon name="info" size={15} /></span>
              <p className="text-[12px] leading-relaxed text-muted">{p.raise_note}</p>
            </div>
          )}
          {footStats.length > 0 && (
            <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-3">
              {footStats.map((s) => (
                <div key={s.label} className="flex items-center gap-2.5">
                  <IconBadge name={s.icon} color={s.color} size={28} />
                  <div>
                    <div className="num text-[14px] font-semibold leading-none">{s.value}</div>
                    <div className="mt-1 text-[11px] text-muted">{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {p.updated_ts && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-faint">
          <Icon name="clock" size={12} />
          Last updated {timeAgo(p.updated_ts)}
        </p>
      )}
    </section>
  );
}
