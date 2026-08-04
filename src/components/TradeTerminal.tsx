"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "./wallet";
import { fmtUsd, fmtNum, shortAddr } from "@/lib/format";

/**
 * Trading terminal shell. The order form is deliberately inert — no swap route
 * is wired yet — but it computes real quantities from the live price so the
 * numbers a user sees while sizing an order are truthful. Execution, wallet
 * connection and trade prints slot in without changing this layout.
 */
export function TradeTerminal({
  symbol, mint, price, liquidity, vol24h,
}: {
  symbol: string; mint: string | null;
  price: number | null; liquidity: number | null; vol24h: number | null;
}) {
  const w = useWallet();
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [held, setHeld] = useState<number | null>(null);

  // live balance of this token once a wallet is connected
  useEffect(() => {
    let alive = true;
    if (w.address && mint) {
      void w.tokenBalance(mint).then((b) => { if (alive) setHeld(b); });
    } else setHeld(null);
    return () => { alive = false; };
  }, [w.address, mint, w]);

  const amt = Number(amount) || 0;
  const receive = useMemo(() => {
    if (!price || amt <= 0) return null;
    return side === "buy" ? amt / price : amt * price;
  }, [amt, price, side]);

  /** Share of pool depth this order would consume — a real risk signal. */
  const impact = useMemo(() => {
    if (!liquidity || amt <= 0) return null;
    const usd = side === "buy" ? amt : amt * (price ?? 0);
    return (usd / liquidity) * 100;
  }, [amt, liquidity, price, side]);

  const inCcy = side === "buy" ? "USDC" : symbol;
  const outCcy = side === "buy" ? symbol : "USDC";

  return (
    <div className="space-y-4">
      {/* side selector */}
      <div className="flex gap-1 rounded-xl border border-line bg-page/60 p-1">
        {(["buy", "sell"] as const).map((s) => {
          const on = side === s;
          return (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={`flex-1 rounded-lg py-2 text-[13px] font-bold capitalize transition-colors ${
                on
                  ? s === "buy"
                    ? "bg-good/15 text-good"
                    : "bg-bad/15 text-bad"
                  : "text-muted hover:text-ink2"
              }`}
            >
              {s}
            </button>
          );
        })}
      </div>

      {/* amount */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-[11px] uppercase tracking-[0.07em] text-faint">You pay</label>
          <span className="text-[11px] text-faint">{inCcy}</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-page/60 px-3.5 py-2.5 focus-within:border-accent/50">
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0.00"
            inputMode="decimal"
            className="num min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ink outline-none placeholder:text-faint"
          />
          <span className="text-[12.5px] font-semibold text-muted">{inCcy}</span>
        </div>
        <div className="mt-2 flex gap-1.5">
          {["100", "500", "1000", "5000"].map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              className="flex-1 rounded-lg border border-line py-1 text-[11.5px] text-muted transition-colors hover:border-line2 hover:text-ink"
            >
              {side === "buy" ? `$${v}` : v}
            </button>
          ))}
        </div>
      </div>

      {/* receive */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-[11px] uppercase tracking-[0.07em] text-faint">You receive</label>
          <span className="text-[11px] text-faint">estimated</span>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-line bg-page/60 px-3.5 py-2.5">
          <span className="num min-w-0 flex-1 truncate text-[17px] font-semibold">
            {receive != null ? (side === "buy" ? fmtNum(receive) : fmtUsd(receive, { compact: false })) : <span className="text-faint">—</span>}
          </span>
          <span className="text-[12.5px] font-semibold text-muted">{outCcy}</span>
        </div>
      </div>

      {/* order detail */}
      <div className="space-y-2 rounded-xl border border-line bg-page/40 px-3.5 py-3">
        <Row label="Price">
          <span className="num">{price != null ? fmtUsd(price, { compact: false }) : "—"}</span>
        </Row>
        <Row label="Slippage">
          <span className="flex gap-1">
            {["0.5", "1", "3"].map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`num rounded px-1.5 py-0.5 text-[11.5px] ${
                  slippage === s ? "bg-white/10 text-ink" : "text-muted hover:text-ink2"
                }`}
              >
                {s}%
              </button>
            ))}
          </span>
        </Row>
        <Row label="Pool depth">
          <span className="num">{fmtUsd(liquidity)}</span>
        </Row>
        {impact != null && (
          <Row label="Order vs depth">
            <span className={`num font-semibold ${impact > 5 ? "text-bad" : impact > 1 ? "text-warn" : "text-good"}`}>
              {impact < 0.01 ? "<0.01" : impact.toFixed(2)}%
            </span>
          </Row>
        )}
        <Row label="Route">
          <span className="text-muted">MetaDAO futarchy AMM</span>
        </Row>
      </div>

      {impact != null && impact > 5 && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-[11.5px] leading-relaxed text-ink2">
          This order is {impact.toFixed(0)}% of total pool depth and would move the price
          materially against you.
        </p>
      )}

      {w.address ? (
        <>
          <div className="flex items-center justify-between rounded-xl border border-line bg-page/40 px-3.5 py-2.5 text-[12.5px]">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />
              {shortAddr(w.address)}
            </span>
            <span className="num text-ink2">
              {side === "buy"
                ? w.usdcBalance != null ? `${fmtUsd(w.usdcBalance)} USDC` : "…"
                : held != null ? `${fmtNum(held)} ${symbol}` : "…"}
            </span>
          </div>
          <button
            disabled
            title="Swap routing ships next — quotes above are live"
            className="w-full cursor-not-allowed rounded-xl bg-accent/60 py-2.5 text-[13px] font-bold text-white"
          >
            {side === "buy" ? `Buy ${symbol}` : `Sell ${symbol}`} — routing soon
          </button>
        </>
      ) : (
        <button
          onClick={() => void w.connect()}
          disabled={w.connecting}
          className="w-full rounded-xl bg-accent py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-accenthi disabled:opacity-60"
        >
          {w.connecting ? "Connecting…" : w.available ? "Connect wallet to trade" : "Get Phantom to trade"}
        </button>
      )}

      <p className="text-[11px] leading-relaxed text-faint">
        Balances and quotes are live; swap execution lands next. Until then the buttons below
        route through Jupiter or MetaDAO with the same pair pre-selected.
      </p>

      {mint && (
        <div className="border-t border-grid pt-3.5">
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-faint">Execute elsewhere</div>
          <div className="flex flex-wrap gap-2">
            <a
              href={`https://jup.ag/swap/USDC-${mint}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-line py-1.5 text-center text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              Jupiter ↗
            </a>
            <a
              href={`https://metadao.fi/${symbol.toLowerCase()}`}
              target="_blank" rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-line py-1.5 text-center text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-accent"
            >
              MetaDAO ↗
            </a>
          </div>
        </div>
      )}

      <div className="border-t border-grid pt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">24h activity</span>
        </div>
        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted">Volume</span>
          <span className="num font-semibold">{fmtUsd(vol24h)}</span>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Individual trade prints need a websocket subscription to the pool — reserved for the
          trading release.
        </p>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-muted">{label}</span>
      {children}
    </div>
  );
}
