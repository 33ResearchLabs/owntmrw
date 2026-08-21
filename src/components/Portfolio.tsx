"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";
import { Logo } from "./ui";
import { Sparkline } from "./viz";
import { CopyButton } from "./CopyButton";
import {
  fmtUsd,
  fmtNum,
  fmtPct,
  fmtPrice,
  shortAddr,
  timeAgo,
} from "@/lib/format";

export interface PortfolioToken {
  slug: string;
  name: string;
  symbol: string | null;
  mint: string;
  image_url: string | null;
  price_usd: number | null;
  change_24h: number | null;
  liquidity_usd: number | null;
  raise_price: number | null;
  usdcBalance: number | null;
  roi_since_raise: number | null;
  ath: number | null;
  from_ath: number | null;
  returns_thin: boolean;
  closes: number[];
}

export interface PortfolioFeedItem {
  ts: number;
  type: string;
  title: string;
  slugs: string[];
  names: string[];
}

export interface PortfolioSignal {
  slug: string;
  name: string;
  text: string;
}

interface Holding extends PortfolioToken {
  amount: number;
  value: number | null;
  /** Portion of `amount` that's a simulated position rather than a real on-chain balance. */
  simulated: number;
  /** What the simulated portion actually cost, and P&L against its current value. Null when there's no trade history for this mint (e.g. a purely on-chain balance) — cost basis can't be known for tokens acquired outside this app. */
  costBasisUsd: number | null;
  avgPriceUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
}

interface LedgerTrade {
  mint: string;
  side: "buy" | "sell";
  tokenAmount: number;
  priceUsd: number | null;
  usdAmount: number;
  txSignature: string | null;
  ts: number;
}

interface CostBasisEntry {
  tokens: number;
  costBasisUsd: number;
  avgPriceUsd: number | null;
}

type ScanState = "idle" | "loading" | "done" | "failed";

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

export function Portfolio({
  tokens,
  solPrice = null,
  events = [],
  signals = [],
}: {
  tokens: PortfolioToken[];
  solPrice?: number | null;
  events?: PortfolioFeedItem[];
  signals?: PortfolioSignal[];
}) {
  const w = useWallet();
  const signIn = useSignIn();
  const { address, allTokenBalances, allLedgerBalances } = w;

  /*
   * A connected wallet is not a signed-in one, and a session names one
   * wallet — if the user switches accounts in Phantom afterwards, `address`
   * moves and `session` does not. Same convention ConnectButton uses for
   * the header; see its comment for why.
   */
  const stale =
    w.session != null && address != null && address !== w.session;

  const ready = w.session != null && !stale;

  const [scan, setScan] = useState<{
    owner: string;
    holdings: Holding[] | null;
  } | null>(null);

  const [trades, setTrades] = useState<LedgerTrade[]>([]);

  const [range, setRange] = useState<Range>(30);
  const [hidden, setHidden] = useState(false);

  /*
   * Read the wallet directly from chain.
   *
   * This is intentionally done on the client because the connected wallet
   * belongs to the browser session. Nothing is stored by the portfolio.
   */
  useEffect(() => {
    if (!ready || !address) {
      setScan(null);
      setTrades([]);
      return;
    }

    let cancelled = false;

    async function refreshBalances() {
      try {
        const [balances, ledger, history] = await Promise.all([
          allTokenBalances(),
          allLedgerBalances(),
          fetch("/api/positions/history", {
            cache: "no-store",
            credentials: "same-origin",
          })
            .then((res) =>
              res.ok
                ? (res.json() as Promise<{
                    trades: LedgerTrade[];
                    costBasis: Record<string, CostBasisEntry>;
                  }>)
                : null,
            )
            .catch(() => null),
        ]);

        if (cancelled) return;

        if (address && !balances) {
          setScan({
            owner: address,
            holdings: null,
          });
          return;
        }

        const costBasis = history?.costBasis ?? {};

        if (!cancelled) setTrades(history?.trades ?? []);

        /*
         * Match every tracked project against the actual wallet token mint,
         * plus whatever simulated position the ledger has for it.
         *
         * Example:
         *
         * balances.get(META_MINT)
         *       ↓
         * 0.83 META
         *
         * No META-specific hardcoding is required.
         *
         * P&L only ever covers the simulated slice — cost basis for a real
         * on-chain balance acquired outside this app is genuinely unknown,
         * so it's left null rather than guessed from the current price.
         */
        const found = tokens
          .map((t) => {
            const onchain = (balances && balances.get(t.mint)) ?? 0;
            const simulated = ledger.get(t.mint) ?? 0;
            const amount = onchain + simulated;
            const cb = simulated > 0 ? (costBasis[t.mint] ?? null) : null;
            const pnlUsd =
              cb != null && t.price_usd != null
                ? cb.tokens * t.price_usd - cb.costBasisUsd
                : null;

            return {
              ...t,
              amount,
              simulated,
              value: t.price_usd != null ? amount * t.price_usd : null,
              costBasisUsd: cb?.costBasisUsd ?? null,
              avgPriceUsd: cb?.avgPriceUsd ?? null,
              pnlUsd,
              pnlPct:
                pnlUsd != null && cb != null && cb.costBasisUsd > 0
                  ? (pnlUsd / cb.costBasisUsd) * 100
                  : null,
            };
          })
          .filter((h) => h.amount > 0)
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
        if (address) {
          setScan({
            owner: address,
            holdings: found,
          });
        }
      } catch (error) {
        console.error("Portfolio balance refresh failed:", error);

        if (!cancelled) {
          if (address) {
            setScan({
              owner: address,
              holdings: null,
            });
          }
        }
      }
    }

    // Initial read immediately.
    void refreshBalances();

    /*
     * Automatically refresh after a trade.
     *
     * When the user buys META on the trade page, the Solana transaction
     * changes the wallet balance. Portfolio will pick that up automatically.
     */
    const interval = window.setInterval(() => {
      void refreshBalances();
    }, 5000);

    /*
     * Refresh immediately when the user comes back to this browser tab.
     */
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void refreshBalances();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [ready, address, allTokenBalances, allLedgerBalances, tokens]);

  const state: ScanState = !ready || !address
    ? "idle"
    : scan?.owner !== address
      ? "loading"
      : scan.holdings === null
        ? "failed"
        : "done";

  const holdings = useMemo(
    () => (state === "done" ? scan!.holdings! : []),
    [state, scan],
  );

  const held = useMemo(() => new Set(holdings.map((h) => h.slug)), [holdings]);

  const tokenByMint = useMemo(
    () => new Map(tokens.map((t) => [t.mint, t])),
    [tokens],
  );

  const feed = useMemo(
    () => events.filter((e) => e.slugs.some((s) => held.has(s))).slice(0, 6),
    [events, held],
  );

  const sigs = useMemo(
    () => signals.filter((s) => held.has(s.slug)).slice(0, 6),
    [signals, held],
  );

  /*
   * Historical position curve.
   */
  const curve = useMemo(() => {
    const withHistory = holdings.filter(
      (h) => h.closes.length >= 2 && h.price_usd != null,
    );

    if (!withHistory.length) {
      return {
        points: [] as number[],
        days: 0,
        covered: 0,
      };
    }

    const span = Math.min(range, ...withHistory.map((h) => h.closes.length));

    const points = Array.from({ length: span }, (_, i) =>
      withHistory.reduce(
        (s, h) => s + h.amount * h.closes[h.closes.length - span + i],
        0,
      ),
    );

    return {
      points,
      days: span,
      covered: withHistory.length,
    };
  }, [holdings, range]);

  /*
   * Not signed in, signed in on a wallet Phantom is no longer on, or signed
   * in but this browser's wallet hasn't reconnected — none of these can
   * read balances. A connected wallet is not a signed-in one (Phantom
   * reconnects silently for a site it already trusts), so this checks
   * `session`, not `address` — same convention ConnectButton uses.
   */
  if (!ready) {
    return (
      <div className="card px-6 py-10 text-center">
        <h2 className="text-[15px] font-semibold">
          {stale ? "Wallet changed" : "No wallet connected"}
        </h2>

        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
          {stale
            ? "Your wallet switched accounts since you signed in. Sign in again with the new one to see its holdings."
            : <>Sign in with a Solana wallet to see what you hold across the{" "}
              {tokens.length} tokens tracked here. Balances are read live from the
              chain and never stored.</>}
        </p>

        <button
          onClick={() => signIn.open()}
          disabled={w.signingIn}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white transition-[filter] duration-150 hover:brightness-[1.08] active:brightness-95 disabled:opacity-60"
        >
          {w.signingIn
            ? "Check your wallet…"
            : stale
              ? "Reconnect"
              : w.available
                ? "Sign in"
                : "Get Phantom"}
        </button>
      </div>
    );
  }

  if (!address) {
    return (
      <div className="card px-6 py-10 text-center">
        <h2 className="text-[15px] font-semibold">Wallet not connected here</h2>

        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
          You&rsquo;re signed in, but this browser&rsquo;s wallet hasn&rsquo;t
          connected. Reconnect it to read balances.
        </p>

        <button
          onClick={() => void w.connect()}
          disabled={w.connecting}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white transition-[filter] duration-150 hover:brightness-[1.08] active:brightness-95 disabled:opacity-60"
        >
          {w.connecting ? "Connecting…" : "Connect wallet"}
        </button>
      </div>
    );
  }

  /*
   * Total tracked token positions.
   */
  const positions = holdings.reduce((s, h) => s + (h.value ?? 0), 0);

  /*
   * What was actually put in, and the resulting unrealised P&L — both
   * summed only over holdings with a known cost basis (the simulated
   * portion of a position; see the P&L column note below for why a purely
   * on-chain balance can't contribute here).
   */
  const totalInvested = holdings.reduce(
    (s, h) => s + (h.costBasisUsd ?? 0),
    0,
  );

  const totalPnlUsd = holdings.reduce((s, h) => s + (h.pnlUsd ?? 0), 0);

  const hasCostBasis = holdings.some((h) => h.costBasisUsd != null);

  const priced = holdings.filter((h) => h.value != null).length;

  const unpriced = holdings.length - priced;

  /*
   * SOL value.
   */
  const solValue =
    solPrice != null && w.solBalance != null ? w.solBalance * solPrice : null;

  /*
   * Total portfolio value:
   *
   * tracked tokens
   * + SOL
   * + USDT
   */
  const net = positions + (solValue ?? 0) + (w.usdtBalance ?? 0);

  /*
   * 24h movement.
   */
  const movers = holdings.filter(
    (h) => h.value != null && h.change_24h != null && !h.returns_thin,
  );

  const moverBase = movers.reduce((s, h) => s + h.value!, 0);

  const chg24Usd = movers.reduce(
    (s, h) => s + (h.value! * h.change_24h!) / 100,
    0,
  );

  const chg24Pct = moverBase > 0 ? (chg24Usd / moverBase) * 100 : null;

  const money = (n: number | null | undefined) =>
    hidden ? "••••••" : n == null ? "—" : fmtUsd(n);

  return (
    <div className="space-y-5">
      {/* ------------------------------------------------------------ */}
      {/* 1 — NET WORTH                                               */}
      {/* ------------------------------------------------------------ */}

      <section className="card overflow-hidden">
        <div className="grid lg:grid-cols-[minmax(240px,300px)_1fr]">
          <div className="border-b border-grid px-5 py-5 lg:border-b-0 lg:border-r">
            <div className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.08em] text-muted">
              Net worth
              <button
                onClick={() => setHidden((h) => !h)}
                className="opacity-50 transition-opacity hover:opacity-100"
                aria-label={hidden ? "Show values" : "Hide values"}
              >
                {hidden ? "◌" : "◉"}
              </button>
            </div>

            <div className="num mt-2 text-[30px] font-extrabold leading-none tracking-[-0.025em]">
              {state === "done" ? money(net) : state === "failed" ? "—" : "…"}
            </div>

            {state === "failed" && (
              <div className="mt-2 text-[12px] leading-relaxed text-bad">
                Balance read failed — no total to show.
              </div>
            )}

            {state === "done" && chg24Pct != null && (
              <div
                className={`num mt-2 text-[12.5px] ${
                  chg24Usd >= 0 ? "text-good" : "text-bad"
                }`}
              >
                {hidden
                  ? "••••"
                  : `${chg24Usd >= 0 ? "+" : "−"}${fmtUsd(Math.abs(chg24Usd))}`}
                {" · "}
                {fmtPct(chg24Pct)}
                <span className="text-muted"> 24h</span>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-grid pt-3">
              <Split
                label="Positions"
                value={
                  state === "done"
                    ? money(positions)
                    : state === "failed"
                      ? "—"
                      : "…"
                }
              />

              <Split
                label="SOL"
                value={
                  solValue != null
                    ? money(solValue)
                    : w.solBalance != null
                      ? `${w.solBalance.toFixed(3)} SOL`
                      : "—"
                }
                sub={
                  solValue == null && w.solBalance != null
                    ? "no quote"
                    : undefined
                }
              />

              <Split
                label="USDT"
                value={money(w.usdtBalance)}
                sub="available to invest"
              />

              {hasCostBasis && (
                <Split
                  label="Invested"
                  value={money(totalInvested)}
                  sub={
                    hidden ? undefined : (
                      <span className={totalPnlUsd >= 0 ? "text-good" : "text-bad"}>
                        {totalPnlUsd >= 0 ? "+" : "−"}
                        {fmtUsd(Math.abs(totalPnlUsd))} P&amp;L
                      </span>
                    )
                  }
                />
              )}
            </div>

            {unpriced > 0 && (
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                {unpriced} position
                {unpriced > 1 ? "s have" : " has"} no live quote and
                {unpriced > 1 ? " are" : " is"} excluded from the total.
              </p>
            )}
          </div>

          <div className="flex flex-col px-5 py-4">
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted">
                Position value
              </span>

              <div className="flex gap-1">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded-lg border px-2.5 py-1 text-[11px] transition-colors ${
                      range === r
                        ? "border-line2 bg-surface2 text-ink"
                        : "border-transparent text-muted hover:text-ink2"
                    }`}
                  >
                    {r}D
                  </button>
                ))}
              </div>
            </div>

            {curve.points.length >= 2 ? (
              <>
                <ValueChart points={curve.points} hidden={hidden} />

                <p className="mt-2 text-[10.5px] leading-relaxed text-faint">
                  Today&rsquo;s balances valued at past prices over the{" "}
                  {curve.days} days all{" "}
                  {curve.covered === 1
                    ? "this position covers"
                    : ` ${curve.covered} positions cover`}{" "}
                  — how these holdings would have moved, not your realised
                  return.
                </p>
              </>
            ) : (
              <p className="flex h-[150px] items-center justify-center text-[12px] text-muted">
                {state === "done"
                  ? "Not enough price history to chart."
                  : state === "failed"
                    ? "No balances to chart."
                    : "Reading balances…"}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 2 — ALLOCATION                                               */}
      {/* ------------------------------------------------------------ */}

      {state === "done" && (
        <section className="card overflow-hidden">
          <CardHead
            title="Allocation"
            sub={
              priced > 0
                ? `Share of position value. Largest holding is ${(
                    ((holdings[0].value ?? 0) / positions) *
                    100
                  ).toFixed(0)}% of the book.`
                : "Share of position value, once there is a position to share."
            }
          />

          {priced === 0 ? (
            <Placeholder ghost="bars">
              Each token you hold takes a slice here, largest first, so
              concentration is visible at a glance rather than inferred from a
              column of values.
            </Placeholder>
          ) : (
            <div className="flex flex-col gap-2.5 px-5 py-4">
              {holdings
                .filter((h) => h.value != null)
                .map((h) => {
                  const share = (h.value! / positions) * 100;

                  return (
                    <div key={h.mint} className="flex items-center gap-3">
                      <Link
                        href={`/project/${h.slug}`}
                        className="flex w-[104px] shrink-0 items-center gap-2 text-[12.5px] font-semibold hover:text-brand"
                      >
                        <Logo src={h.image_url} name={h.name} size={16} />

                        <span className="truncate">{h.symbol ?? h.name}</span>
                      </Link>

                      <span className="h-[7px] min-w-0 flex-1 overflow-hidden rounded-full bg-surface2">
                        <span
                          className="block h-full rounded-full"
                          style={{
                            width: `${share}%`,
                            background:
                              "linear-gradient(90deg, var(--brand), var(--brand-hi))",
                          }}
                        />
                      </span>

                      <span className="num w-[80px] shrink-0 text-right text-[12px] text-ink2">
                        {money(h.value)}
                      </span>

                      <span className="num w-[44px] shrink-0 text-right text-[12px] text-muted">
                        {share.toFixed(1)}%
                      </span>
                    </div>
                  );
                })}
            </div>
          )}
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 3 — HOLDINGS                                                 */}
      {/* ------------------------------------------------------------ */}

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-grid px-5 py-4">
          <div>
            <h2 className="text-[15px] font-semibold">Holdings</h2>

            <p className="mt-0.5 text-[12px] text-ink2">
              Balances read live from the chain, priced at live quotes.
            </p>
          </div>

          <span className="text-[11.5px] text-muted">
            {state === "loading"
              ? "reading chain…"
              : state === "failed"
                ? "balance read failed"
                : `scanned ${tokens.length} mints`}
          </span>
        </div>

        {state === "failed" ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">
            Balances could not be read just now. Nothing is shown rather than a
            zero balance, which would read as an empty wallet.
          </p>
        ) : state !== "done" ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">
            Reading balances…
          </p>
        ) : holdings.length === 0 ? (
          <EmptyHoldings scanned={tokens.length} />
        ) : (
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead>
                <tr>
                  <th>Token</th>
                  <th className="!text-right">Balance</th>
                  <th className="!text-right">Price</th>
                  <th className="!text-right">24h</th>
                  <th className="!text-right">7d</th>
                  <th className="!text-right">30d</th>
                  <th className="!text-right">Trend</th>
                  <th className="!text-right">Value</th>
                  <th
                    className="!text-right"
                    title="Unrealised gain/loss on the simulated portion of this holding only — cost basis for real on-chain balances acquired outside this app can't be known"
                  >
                    P&amp;L
                  </th>
                  <th className="!text-right">Share</th>
                </tr>
              </thead>

              <tbody>
                {holdings.map((h) => (
                  <tr key={h.mint}>
                    <td>
                      <Link
                        href={`/project/${h.slug}`}
                        className="flex items-center gap-2.5 hover:text-brand"
                      >
                        <Logo src={h.image_url} name={h.name} size={22} />

                        <span className="font-medium">{h.name}</span>

                        {h.symbol && (
                          <span className="text-[11px] text-muted">
                            {h.symbol}
                          </span>
                        )}
                      </Link>
                    </td>

                    <td className="num text-right">
                      {hidden ? (
                        "••••"
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          {h.simulated > 0 && <SimFlag />}
                          {fmtNum(h.amount)}
                        </span>
                      )}
                    </td>

                    <td className="num text-right text-ink2">
                      {fmtPrice(h.price_usd)}
                    </td>

                    <td className="text-right">
                      {h.returns_thin ? <ThinFlag /> : <Pct v={h.change_24h} />}
                    </td>

                    <td className="text-right">
                      {h.returns_thin ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <Pct v={lookback(h.closes, 7)} />
                      )}
                    </td>

                    <td className="text-right">
                      {h.returns_thin ? (
                        <span className="text-muted">—</span>
                      ) : (
                        <Pct v={lookback(h.closes, 30)} />
                      )}
                    </td>

                    <td>
                      <div className="ml-auto w-[84px]">
                        {h.closes.length >= 2 ? (
                          <Sparkline
                            values={h.closes.slice(-30)}
                            height={24}
                            fallback
                            color={
                              (lookback(h.closes, 30) ?? 0) >= 0
                                ? "var(--good)"
                                : "var(--bad)"
                            }
                          />
                        ) : (
                          <span className="block text-right text-muted">—</span>
                        )}
                      </div>
                    </td>

                    <td className="num text-right font-semibold">
                      {money(h.value)}
                    </td>

                    <td className="text-right">
                      {h.pnlUsd == null ? (
                        <span className="text-muted">—</span>
                      ) : hidden ? (
                        <span className="num text-muted">••••</span>
                      ) : (
                        <div className="leading-tight">
                          <div
                            className={`num ${h.pnlUsd >= 0 ? "text-good" : "text-bad"}`}
                          >
                            {h.pnlUsd >= 0 ? "+" : "−"}
                            {fmtUsd(Math.abs(h.pnlUsd))}
                            {h.pnlPct != null && (
                              <span className="ml-1 text-[11px]">
                                ({h.pnlUsd >= 0 ? "+" : "−"}
                                {Math.abs(h.pnlPct).toFixed(1)}%)
                              </span>
                            )}
                          </div>
                          {h.avgPriceUsd != null && (
                            <div className="num mt-0.5 text-[10px] text-faint">
                              bought at {fmtPrice(h.avgPriceUsd)}
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    <td className="num text-right text-muted">
                      {h.value != null && positions > 0
                        ? `${((h.value / positions) * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-grid px-5 py-3 text-[11px] leading-relaxed text-muted">
          Balances are read live from the chain for this session and never
          stored.
          {holdings.length > 0 && (
            <>
              {" "}
              A position whose pool sits below the reliability floor shows{" "}
              <span className="text-warn">thin</span> instead of a return — the
              arithmetic would be sound on a price the market cannot defend.
            </>
          )}
        </div>
      </section>

      {/* ------------------------------------------------------------ */}
      {/* 3b — TRADE HISTORY                                           */}
      {/* ------------------------------------------------------------ */}

      {state === "done" && (
        <section className="card overflow-hidden">
          <CardHead
            title="Trade history"
            sub="Every buy and sell placed through this app's trade terminal."
          />

          {trades.length === 0 ? (
            <Placeholder>
              Buy or sell a tracked token from its project page and it shows up
              here — what you paid, when, and at what price.
            </Placeholder>
          ) : (
            <div className="divide-y divide-grid">
              {trades.map((t, i) => {
                const token = tokenByMint.get(t.mint);
                const buy = t.side === "buy";

                return (
                  <div
                    key={`${t.mint}-${t.ts}-${i}`}
                    className="flex items-center gap-3 px-5 py-3"
                  >
                    <span
                      className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                        buy ? "bg-good/15 text-good" : "bg-bad/15 text-bad"
                      }`}
                    >
                      {t.side}
                    </span>

                    {token ? (
                      <Link
                        href={`/project/${token.slug}`}
                        className="flex min-w-0 flex-1 items-center gap-2 hover:text-brand"
                      >
                        <Logo src={token.image_url} name={token.name} size={20} />
                        <span className="truncate text-[12.5px] font-medium">
                          {token.symbol ?? token.name}
                        </span>
                      </Link>
                    ) : (
                      <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted">
                        {shortAddr(t.mint)}
                      </span>
                    )}

                    <span className="num shrink-0 text-right text-[12.5px]">
                      {fmtNum(t.tokenAmount)}{" "}
                      <span className="text-muted">
                        {token?.symbol ?? "tokens"}
                      </span>
                    </span>

                    <span className="num hidden w-[80px] shrink-0 text-right text-[12px] text-ink2 sm:block">
                      {t.priceUsd != null ? fmtPrice(t.priceUsd) : "—"}
                    </span>

                    <span className="num w-[76px] shrink-0 text-right text-[12.5px] font-semibold">
                      {fmtUsd(t.usdAmount)}
                    </span>

                    <span className="hidden w-[80px] shrink-0 text-right text-[11px] text-faint md:block">
                      {timeAgo(t.ts)}
                    </span>

                    {t.txSignature ? (
                      <a
                        href={`https://explorer.solana.com/tx/${t.txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-[11px] text-brand hover:underline"
                        title="View the on-chain USDT transfer"
                      >
                        ↗
                      </a>
                    ) : (
                      <span className="w-[14px] shrink-0" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="border-t border-grid px-5 py-3 text-[11px] leading-relaxed text-muted">
            Buys move real USDT on Devnet into the app&rsquo;s vault; the token
            side is a simulated position tracked here rather than a real
            transfer, and sells close that position without moving funds back.
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 4 — PERFORMANCE SINCE RAISE                                  */}
      {/* ------------------------------------------------------------ */}

      {state === "done" && (
        <section className="card overflow-hidden">
          <CardHead
            title="Performance since raise"
            sub="What each token has done against the price its backers paid — not against your entry."
          />

          {!holdings.some((h) => h.raise_price != null) ? (
            <Placeholder ghost="rows">
              For each token you hold that ran a raise: the price its backers
              paid, where it trades now, and how far it sits below its all-time
              high.
            </Placeholder>
          ) : (
            <div className="scroll-x">
              <table className="itable text-[13px]">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th className="!text-right">Raise price</th>
                    <th className="!text-right">Now</th>
                    <th className="!text-right">Since raise</th>
                    <th className="!text-right">From ATH</th>
                    <th className="!text-right">ATH</th>
                  </tr>
                </thead>

                <tbody>
                  {holdings
                    .filter((h) => h.raise_price != null)
                    .map((h) => (
                      <tr key={h.mint}>
                        <td>
                          <Link
                            href={`/project/${h.slug}`}
                            className="flex items-center gap-2.5 hover:text-brand"
                          >
                            <Logo src={h.image_url} name={h.name} size={20} />

                            <span className="font-medium">
                              {h.symbol ?? h.name}
                            </span>
                          </Link>
                        </td>

                        <td className="num text-right text-ink2">
                          {fmtPrice(h.raise_price)}
                        </td>

                        <td className="num text-right text-ink2">
                          {fmtPrice(h.price_usd)}
                        </td>

                        <td className="text-right font-semibold">
                          <Pct v={h.roi_since_raise} dp={0} />
                        </td>

                        <td className="text-right">
                          <Pct v={h.from_ath} dp={0} />
                        </td>

                        <td className="num text-right text-ink2">
                          {fmtPrice(h.ath)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-grid px-5 py-3 text-[11px] leading-relaxed text-muted">
            This is the token&rsquo;s history, not yours — your own unrealised
            P&amp;L is in the Holdings table above, for the simulated portion
            of each position. Realised P&amp;L and hold duration still
            aren&rsquo;t shown: they&rsquo;d need every acquisition and every
            exit, not just what&rsquo;s currently open.
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 5 — EXIT LIQUIDITY                                           */}
      {/* ------------------------------------------------------------ */}

      {state === "done" && (
        <section className="card overflow-hidden">
          <CardHead
            title="Exit liquidity"
            sub="Your position measured against the pool that would have to absorb it."
          />

          {!holdings.some((h) => h.value != null && h.liquidity_usd) ? (
            <Placeholder ghost="rows">
              Each position weighed against the pool that would have to buy it
              back.
            </Placeholder>
          ) : (
            <div className="scroll-x">
              <table className="itable text-[13px]">
                <thead>
                  <tr>
                    <th>Token</th>
                    <th className="!text-right">Position</th>
                    <th className="!text-right">Pool liquidity</th>
                    <th className="!text-right">Share of pool</th>
                    <th className="!text-right">Assessment</th>
                  </tr>
                </thead>

                <tbody>
                  {holdings
                    .filter((h) => h.value != null && h.liquidity_usd)
                    .map((h) => ({
                      ...h,
                      share: (h.value! / h.liquidity_usd!) * 100,
                    }))
                    .sort((a, b) => b.share - a.share)
                    .map((h) => {
                      const sev =
                        h.share > 100 ? "crit" : h.share > 5 ? "warn" : "ok";

                      return (
                        <tr key={h.mint}>
                          <td>
                            <span className="flex items-center gap-2.5">
                              <span
                                aria-hidden
                                className={`h-[5px] w-[5px] shrink-0 rounded-full ${
                                  sev === "crit"
                                    ? "bg-bad"
                                    : sev === "warn"
                                      ? "bg-warn"
                                      : "bg-good"
                                }`}
                              />

                              <Link
                                href={`/project/${h.slug}`}
                                className="font-medium hover:text-brand"
                              >
                                {h.symbol ?? h.name}
                              </Link>
                            </span>
                          </td>

                          <td className="num text-right">{money(h.value)}</td>

                          <td className="num text-right text-ink2">
                            {fmtUsd(h.liquidity_usd, {
                              compact: true,
                            })}
                          </td>

                          <td
                            className={`num text-right font-semibold ${
                              sev === "crit"
                                ? "text-bad"
                                : sev === "warn"
                                  ? "text-warn"
                                  : "text-muted"
                            }`}
                          >
                            {h.share >= 100
                              ? h.share.toFixed(0)
                              : h.share.toFixed(2)}
                            %
                          </td>

                          <td className="text-right">
                            <span
                              className={`inline-block rounded-full border px-2.5 py-1 text-[10.5px] ${
                                sev === "crit"
                                  ? "border-bad/40 text-bad"
                                  : sev === "warn"
                                    ? "border-warn/40 text-warn"
                                    : "border-line2 text-ink2"
                              }`}
                            >
                              {sev === "crit"
                                ? "Cannot exit at quote"
                                : sev === "warn"
                                  ? "Would move the pool"
                                  : "Exits cleanly"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}

          <div className="border-t border-grid px-5 py-3 text-[11px] leading-relaxed text-muted">
            Share of pool is position value ÷ quoted liquidity. Above ~5% a
            market sell moves the price against you; above 100% the quoted price
            is unreachable for the full size.
          </div>
        </section>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 6 — ACTIVITY + SIGNALS                                      */}
      {/* ------------------------------------------------------------ */}

      {state === "done" && (
        <div className="grid gap-5 lg:grid-cols-2">
          <section className="card overflow-hidden">
            <CardHead
              title="Activity in your holdings"
              sub="The timeline, filtered to what you own."
            />

            {feed.length === 0 ? (
              <Placeholder>
                Raises closing, tokens starting to trade, releases shipping and
                news breaking — narrowed to the projects in your wallet.
              </Placeholder>
            ) : (
              <div className="px-5 pb-3 pt-1">
                {feed.map((e) => (
                  <div
                    key={`${e.type}|${e.slugs[0]}|${e.ts}`}
                    className="border-t border-grid py-3 first:border-t-0"
                  >
                    <span className="inline-block rounded bg-surface2 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-muted">
                      {e.type.replace(/_/g, " ")}
                    </span>

                    <div className="mt-1.5 text-[12.5px] font-semibold leading-snug">
                      {e.title}
                    </div>

                    <div className="mt-1 text-[11px] text-faint">
                      {e.names.join(" · ")} · {timeAgo(e.ts)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card overflow-hidden">
            <CardHead
              title="Signals"
              sub="Observations on the projects you hold."
            />

            {sigs.length === 0 ? (
              <Placeholder>
                Volume jumps, holder concentration, development going quiet —
                observations kept to the projects you own.
              </Placeholder>
            ) : (
              <div className="px-5 pb-3 pt-1">
                {sigs.map((s, i) => (
                  <div
                    key={`${s.slug}-${i}`}
                    className="border-t border-grid py-3 text-[12.5px] leading-relaxed text-ink2 first:border-t-0"
                  >
                    <Link
                      href={`/project/${s.slug}`}
                      className="font-semibold text-ink hover:text-brand"
                    >
                      {s.name}
                    </Link>{" "}
                    · {s.text}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* ------------------------------------------------------------ */}
      {/* 7 — PROVENANCE                                               */}
      {/* ------------------------------------------------------------ */}

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span className="num">{shortAddr(address)}</span>

        <CopyButton value={address} />

        <Link
          href={`/wallet/${address}`}
          className="text-brand hover:underline"
        >
          public wallet page →
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function lookback(closes: number[], days: number): number | null {
  if (closes.length <= days) return null;

  const then = closes[closes.length - 1 - days];

  const now = closes[closes.length - 1];

  return then > 0 ? ((now - then) / then) * 100 : null;
}

function Pct({ v, dp = 1 }: { v: number | null | undefined; dp?: number }) {
  if (v == null || !Number.isFinite(v)) {
    return <span className="text-muted">—</span>;
  }

  return (
    <span
      className={`num ${
        v > 0 ? "text-good" : v < 0 ? "text-bad" : "text-ink2"
      }`}
    >
      {`${v > 0 ? "+" : ""}${v.toFixed(dp)}%`}
    </span>
  );
}

function ThinFlag() {
  return (
    <span
      title="Liquidity below the reliability floor"
      className="rounded border border-warn/35 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-warn"
    >
      thin
    </span>
  );
}

/** Marks a balance that includes (or is entirely) a simulated position bought through this app, not a real on-chain holding. */
function SimFlag() {
  return (
    <span
      title="Includes a simulated position bought here — not a real on-chain balance"
      className="rounded border border-accent/35 px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider text-accent"
    >
      sim
    </span>
  );
}

function Placeholder({
  children,
  ghost,
}: {
  children: React.ReactNode;
  ghost?: "bars" | "rows";
}) {
  return (
    <div className="px-5 py-7">
      {ghost && (
        <div
          className="mx-auto mb-5 flex max-w-[520px] flex-col gap-2.5"
          aria-hidden
        >
          {(ghost === "bars" ? [72, 46, 30, 18] : [100, 100, 100]).map(
            (wpc, i) => (
              <div key={i} className="flex items-center gap-3">
                {ghost === "bars" && (
                  <span className="h-2.5 w-12 rounded bg-grid" />
                )}

                <span
                  className="h-2.5 flex-1 rounded bg-grid"
                  style={{
                    maxWidth: ghost === "bars" ? `${wpc}%` : undefined,
                    opacity: 1 - i * 0.22,
                  }}
                />
              </div>
            ),
          )}
        </div>
      )}

      <p className="mx-auto max-w-[460px] text-center text-[12px] leading-relaxed text-muted">
        {children}
      </p>
    </div>
  );
}

function EmptyHoldings({ scanned }: { scanned: number }) {
  return (
    <div className="px-5 py-10 text-center">
      <span
        aria-hidden
        className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-surface2 text-[17px] text-muted"
      >
        ◎
      </span>

      <h3 className="mt-3.5 text-[14.5px] font-semibold">
        No tracked projects in this wallet yet
      </h3>

      <p className="mx-auto mt-1.5 max-w-[420px] text-[12.5px] leading-relaxed text-muted">
        All {scanned} mints were checked against your balances and none came
        back held. Your SOL and USDT are above — they are counted, they are just
        not positions in anything tracked here.
      </p>

      <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
        <Link
          href="/screener"
          className="inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white transition-[filter] duration-150 hover:brightness-[1.08] active:brightness-95"
        >
          Browse the {scanned} projects
        </Link>

        <Link
          href="/observations"
          className="inline-flex items-center gap-2 rounded-xl border border-line2 px-4 py-2.5 text-[13px] font-medium text-ink2 transition-colors duration-150 hover:border-accent hover:text-brand"
        >
          See what&rsquo;s moving
        </Link>
      </div>

      <p className="mt-5 text-[11px] leading-relaxed text-faint">
        The sections below fill in from the same scan — each one describes what
        it will show.
      </p>
    </div>
  );
}

function Split({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] text-muted">{label}</div>

      <div className="num mt-0.5 text-[13.5px] font-semibold">{value}</div>

      {sub != null && <div className="num text-[10px] text-faint">{sub}</div>}
    </div>
  );
}

function CardHead({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="border-b border-grid px-5 py-4">
      <h2 className="text-[15px] font-semibold">{title}</h2>

      <p className="mt-0.5 text-[12px] text-ink2">{sub}</p>
    </div>
  );
}

function ValueChart({ points, hidden }: { points: number[]; hidden: boolean }) {
  const W = 640;
  const H = 150;

  const lo = Math.min(...points);
  const hi = Math.max(...points);

  const span = hi - lo || Math.max(hi * 0.02, 1);

  const pad = span * 0.14;

  const x = (i: number) => (i / (points.length - 1)) * W;

  const y = (v: number) => H - ((v - (lo - pad)) / (span + pad * 2)) * H;

  const line = points
    .map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`)
    .join(" ");

  const rising = points[points.length - 1] >= points[0];

  const stroke = rising ? "var(--good)" : "var(--bad)";

  const id = `pv-${rising ? "up" : "dn"}`;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="block h-[150px] w-full"
        role="img"
        aria-label={`Position value over the last ${points.length} days`}
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.24" />

            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0.25, 0.5, 0.75].map((f) => (
          <line
            key={f}
            x1="0"
            y1={H * f}
            x2={W}
            y2={H * f}
            stroke="var(--grid)"
            strokeWidth="1"
            strokeDasharray="2 4"
          />
        ))}

        <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill={`url(#${id})`} />

        <path
          d={line}
          fill="none"
          stroke={stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      </svg>

      {!hidden && (
        <>
          <span className="num pointer-events-none absolute right-1 top-0 text-[10px] text-faint">
            {fmtUsd(hi, {
              compact: true,
            })}
          </span>

          <span className="num pointer-events-none absolute bottom-0 right-1 text-[10px] text-faint">
            {fmtUsd(lo, {
              compact: true,
            })}
          </span>
        </>
      )}
    </div>
  );
}
