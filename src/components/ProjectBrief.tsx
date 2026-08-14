import { raisePriceOf, type ProjectDetail } from "@/lib/queries";
import {
  fmtUsd,
  fmtNum,
  fmtPct,
  fmtDate,
  fmtPrice,
  timeAgo,
} from "@/lib/format";
import { IconBadge, Sparkline, MeterBar, Icon, type IconName } from "./viz";
import { NA } from "./panels";

interface Tile {
  label: string;
  /** A formatted figure, or `NA` where the project has none. */
  value: React.ReactNode;
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
 * of stat tiles, grouped into The Raise / The Token / The DAO.
 *
 * Every tile in every group renders, always. A figure this project does not
 * have shows `NA` under its own label rather than taking the label with it —
 * dropping the tile made an inapplicable measure look identical to one the app
 * failed to load, and left two projects with different tiles in different
 * positions. The `sub` line carries the reason, which is what keeps an N/A from
 * reading as a load failure.
 */
export function ProjectBrief({ d }: { d: ProjectDetail }) {
  const {
    project: p,
    latest,
    candles,
    holderHistory,
    treasuryValue,
    github,
    ath,
    athTs,
    governance,
  } = d;

  const holders = holderHistory.filter((h) => h.holder_count != null);
  const holderCount = holders.length
    ? holders[holders.length - 1].holder_count
    : null;
  const cur = latest?.price_usd ?? null;
  const rp = raisePriceOf(p);
  const roi = rp && cur ? ((cur - rp.usd) / rp.usd) * 100 : null;
  const oversub =
    p.raise_committed_usd && p.raise_amount_usd && p.raise_amount_usd > 0
      ? p.raise_committed_usd / p.raise_amount_usd
      : null;
  const lockedPct =
    p.team_package && p.total_supply
      ? (p.team_package / p.total_supply) * 100
      : null;
  const floatPct =
    p.circulating_supply && p.total_supply
      ? (p.circulating_supply / p.total_supply) * 100
      : null;
  const athRet = rp && ath ? ((ath - rp.usd) / rp.usd) * 100 : null;
  const treasuryVsRaise =
    treasuryValue != null && p.raise_amount_usd
      ? (treasuryValue / p.raise_amount_usd) * 100
      : null;

  // MetaDAO and Flash.Trade never ran a public launchpad sale — raise_track is
  // only set for tokens that did — so demand, per-token price, valuation and
  // contributor counts were never public figures to show, not data ingest
  // missed. Left silent, the card renders one tile in a grid built for six and
  // reads as broken; the note fills that space with the reason instead.
  const raiseIsPrivate = !p.raise_track;

  const groups: {
    title: string;
    icon: IconName;
    color: string;
    tiles: Tile[];
    note?: string;
  }[] = [
    {
      title: "The Raise",
      icon: "chart",
      color: "var(--accent)",
      note: raiseIsPrivate
        ? (p.raise_note ??
          "Not a launchpad sale — demand, per-token price, valuation and contributor figures were never public for this raise.")
        : undefined,
      tiles: [
        {
          label: "Raised",
          value:
            p.raise_amount_usd == null
              ? NA
              : p.raise_amount_usd === 0
                ? "$0"
                : fmtUsd(p.raise_amount_usd),
          sub:
            p.raise_amount_usd == null
              ? "no raise on record"
              : p.raise_amount_usd === 0
                ? "failed — fully refunded"
                : p.raise_end_ts
                  ? `closed ${fmtDate(p.raise_end_ts)}`
                  : undefined,
          tone:
            p.raise_amount_usd === 0
              ? ("bad" as const)
              : p.raise_amount_usd != null
                ? ("accent" as const)
                : undefined,
          wide: true,
          badge:
            p.raise_amount_usd === 0
              ? "Refunded"
              : p.raise_amount_usd != null && p.raise_end_ts
                ? "Completed"
                : undefined,
        },
        {
          label: "Demand",
          value:
            p.raise_committed_usd != null ? fmtUsd(p.raise_committed_usd) : NA,
          sub:
            oversub != null
              ? `${oversub < 10 ? oversub.toFixed(1) : Math.round(oversub)}× oversubscribed`
              : p.raise_committed_usd != null
                ? "committed"
                : // A private round takes cheques, not commitments — there is no
                  // book to be oversubscribed against, disclosed or otherwise.
                  raiseIsPrivate
                  ? "no commitment book"
                  : "not disclosed",
        },
        {
          label: "Raise Price",
          value:
            rp != null ? `${rp.derived ? "~" : ""}${fmtPrice(rp.usd)}` : NA,
          sub: rp?.derived
            ? "raise ÷ 10M sold"
            : rp == null
              ? "no per-token price published"
              : undefined,
        },
        {
          label: "Raise Valuation",
          value: p.raise_fdv_usd != null ? fmtUsd(p.raise_fdv_usd) : NA,
          sub: p.raise_fdv_usd == null ? "not disclosed" : undefined,
        },
        {
          label: "Contributors",
          value:
            p.raise_contributors != null ? fmtNum(p.raise_contributors) : NA,
          sub:
            p.raise_contributors == null
              ? raiseIsPrivate
                ? "private round"
                : "not disclosed"
              : undefined,
        },
        // A raise with money but no launchpad track was a private round, and
        // "Private" is its track, not a gap. A token that never raised at all
        // (Flash.Trade) has no track to state, so that one is the real N/A.
        {
          label: "Track",
          value:
            p.raise_track === "curated"
              ? "Curated"
              : p.raise_track === "permissionless"
                ? "Permissionless"
                : p.raise_amount_usd != null && p.raise_amount_usd > 0
                  ? "Private"
                  : NA,
          sub:
            p.raise_track === "curated"
              ? "MetaDAO launchpad"
              : p.raise_track === "permissionless"
                ? "via Futard"
                : p.raise_amount_usd != null && p.raise_amount_usd > 0
                  ? "off-launchpad round"
                  : "never ran a raise",
        },
      ],
    },
    {
      title: "The Token",
      icon: "token",
      color: "var(--good)",
      tiles: [
        {
          label: "Return vs Raise",
          value: roi != null ? fmtPct(roi) : NA,
          sub:
            athRet != null
              ? `peaked at ${fmtPct(athRet)}`
              : roi == null
                ? "needs a raise price and a live quote"
                : undefined,
          tone:
            roi == null
              ? undefined
              : roi >= 0
                ? ("good" as const)
                : ("bad" as const),
          wide: true,
          // The price path behind the number — dropped, not drawn empty, when
          // there are no candles: a flat line across an empty box would state a
          // price history this token does not have.
          aside:
            candles.length > 0 ? (
              <div className="w-[42%] max-w-[190px] shrink-0">
                <Sparkline values={candles.map((c) => c.c)} height={38} />
              </div>
            ) : undefined,
        },
        {
          label: "All-Time High",
          value: ath != null ? fmtPrice(ath) : NA,
          sub:
            ath != null
              ? athTs
                ? fmtDate(athTs)
                : undefined
              : "no price history yet",
        },
        {
          label: "Tradeable Float",
          value: floatPct != null ? `${floatPct.toFixed(0)}%` : NA,
          sub:
            floatPct != null
              ? "of total supply"
              : "needs circulating and total supply",
        },
        {
          // Zero is a real answer here and now says so, where it used to fall
          // through the `> 0` guard and hide the tile alongside a genuine gap.
          label: "Team Lock",
          value: lockedPct != null ? `${lockedPct.toFixed(0)}%` : NA,
          sub:
            lockedPct == null
              ? "no team package on record"
              : lockedPct > 0
                ? "price-milestone unlocks"
                : "nothing locked",
        },
        {
          label: "Trading Since",
          value: candles.length > 0 ? fmtDate(candles[0].ts) : NA,
          sub: candles.length > 0 ? undefined : "no candles recorded yet",
        },
      ],
    },
    {
      title: "The DAO",
      icon: "bank",
      color: "#9b7ae0",
      tiles: [
        {
          label: "Treasury",
          value:
            treasuryValue == null
              ? NA
              : treasuryValue < 1
                ? "~$0"
                : fmtUsd(treasuryValue),
          sub:
            treasuryValue == null
              ? p.treasury_address
                ? "vault not read yet"
                : "no DAO vault on record"
              : treasuryValue < 1
                ? "vault is empty"
                : treasuryVsRaise != null
                  ? `${treasuryVsRaise.toFixed(0)}% of the raise still held`
                  : "USDC on-chain",
          tone:
            treasuryValue == null
              ? undefined
              : treasuryValue < 1
                ? ("bad" as const)
                : ("good" as const),
          wide: true,
          // Runway against the raise, which is the only reference point that
          // makes an absolute treasury figure mean anything.
          extra:
            treasuryVsRaise != null ? (
              <div className="mt-2.5">
                <MeterBar
                  pct={Math.min(100, treasuryVsRaise)}
                  color={
                    treasuryVsRaise > 70
                      ? "var(--good)"
                      : treasuryVsRaise < 20
                        ? "var(--bad)"
                        : "var(--warn)"
                  }
                />
              </div>
            ) : undefined,
        },
        {
          label: "Holders",
          value: holderCount != null ? fmtNum(holderCount) : NA,
          sub: holderCount == null ? "no holder snapshot yet" : undefined,
        },
        {
          label: "Liquidity",
          value:
            latest?.liquidity_usd != null ? fmtUsd(latest.liquidity_usd) : NA,
          sub: latest?.liquidity_usd == null ? "no live pool data" : undefined,
        },
        {
          label: "Open Source",
          value: github?.stars != null ? `★ ${fmtNum(github.stars)}` : NA,
          sub:
            github?.stars != null
              ? `${github.repos ?? "?"} public repos`
              : p.github
                ? "repo not indexed yet"
                : "no public repo on record",
        },
        {
          label: "Governance",
          value: governance?.protocol ?? governance?.type ?? NA,
          sub: governance?.voting_model ?? undefined,
        },
      ],
    },
  ];

  // The three figures worth restating beside the note. All three always show,
  // on the same rule as the tiles above: the label is the point, and a chip
  // that disappears takes the reader's reference point with it.
  const footStats: {
    label: string;
    value: React.ReactNode;
    icon: IconName;
    color: string;
  }[] = [
    {
      label: "Contributors",
      value: p.raise_contributors != null ? fmtNum(p.raise_contributors) : NA,
      icon: "users",
      color: "var(--accent)",
    },
    {
      label: "Oversubscribed",
      value:
        oversub != null
          ? `${oversub < 10 ? oversub.toFixed(1) : Math.round(oversub)}×`
          : NA,
      icon: "pie",
      color: "var(--good)",
    },
    {
      label: "Raise Valuation",
      value: p.raise_fdv_usd != null ? fmtUsd(p.raise_fdv_usd) : NA,
      icon: "shield",
      color: "#9b7ae0",
    },
  ];

  const toneCls = (t?: Tile["tone"]) =>
    t === "good"
      ? "text-good"
      : t === "bad"
        ? "text-bad"
        : t === "accent"
          ? "text-brand"
          : "";

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
            href={p.raise_source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] text-faint transition-colors hover:text-brand"
          >
            figures source ↗
          </a>
        )}
      </div>

      {p.description && (
        <div className="card mb-4 px-6 py-5">
          <p className="max-w-4xl text-[13.5px] leading-relaxed text-ink2">
            {p.description}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {groups.map((g) => (
          <div key={g.title} className="card overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-grid px-5 py-3.5">
              <IconBadge name={g.icon} color={g.color} size={28} />
              <h3 className="text-[12px] font-bold uppercase tracking-[0.09em] text-ink2">
                {g.title}
              </h3>
            </div>
            <div className="grid grid-cols-2 gap-px bg-grid">
              {g.tiles.map((t, i) => {
                // Make the last tile span both columns when the narrow tiles
                // are odd-numbered, so the hairline grid has no bare cells.
                const narrowAfter = g.tiles
                  .slice(0, i)
                  .filter((x) => !x.wide).length;
                const narrowTotal = g.tiles.filter((x) => !x.wide).length;
                const stretch =
                  !t.wide &&
                  narrowTotal % 2 === 1 &&
                  narrowAfter === narrowTotal - 1;
                return (
                  <div
                    key={t.label}
                    className={`group bg-surface px-5 py-4 transition-colors hover:bg-surface2 ${t.wide || stretch ? "col-span-2" : ""}`}
                  >
                    <div className="text-[10.5px] uppercase tracking-[0.08em] text-faint">
                      {t.label}
                    </div>
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
                        {t.sub && (
                          <div className="mt-0.5 text-[11.5px] text-muted">
                            {t.sub}
                          </div>
                        )}
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

      {/* The note only appears where it is not already the group's own note —
          a private raise states its reason inside The Raise, and repeating it
          here read as the page saying the same thing twice. */}
      <div className="mt-4 flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4 lg:flex-row lg:items-center">
        {p.raise_note && !raiseIsPrivate && (
          <div className="flex min-w-0 flex-1 gap-3">
            <span className="mt-0.5 shrink-0 text-muted">
              <Icon name="info" size={15} />
            </span>
            <p className="text-[12px] leading-relaxed text-muted">
              {p.raise_note}
            </p>
          </div>
        )}
        <div className="flex shrink-0 flex-wrap gap-x-6 gap-y-3">
          {footStats.map((s) => (
            <div key={s.label} className="flex items-center gap-2.5">
              <IconBadge name={s.icon} color={s.color} size={28} />
              <div>
                <div className="num text-[14px] font-semibold leading-none">
                  {s.value}
                </div>
                <div className="mt-1 text-[11px] text-muted">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {p.updated_ts && (
        <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-faint">
          <Icon name="clock" size={12} />
          Last updated {timeAgo(p.updated_ts)}
        </p>
      )}
    </section>
  );
}
