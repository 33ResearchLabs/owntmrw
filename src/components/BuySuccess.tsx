"use client";

import Link from "next/link";
import { fmtNum, fmtPrice } from "@/lib/format";

/**
 * What a buy looks like from the moment the wallet returns a signature.
 *
 * The on-chain leg (USDT into the vault) is done once the signature exists;
 * the ledger leg (crediting the position) is a second request that can lag
 * or fail. `status` tracks that second leg so the receipt can be shown
 * straight away and honestly say where the position stands.
 */
export interface BuyReceipt {
  signature: string;
  amountUsdt: number | null;
  priceUsd: number | null;
  /** From the server once recorded; estimated from the price until then. */
  tokenAmount: number | null;
  status: "confirming" | "confirmed" | "unrecorded";
  /** Why the ledger credit failed, when `status` is "unrecorded". */
  reason: string | null;
}

/** Token amounts span 0.0004 to 4,000,000 — one fixed precision fits neither. */
function fmtTokens(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (n >= 1000) return fmtNum(n);
  return n.toLocaleString("en-US", {
    maximumFractionDigits: n >= 1 ? 4 : 6,
  });
}

/**
 * The screen that replaces a buy form once the purchase is signed. Shared
 * by the invest modal and the trade panel so a buy from either place ends
 * on the same receipt.
 */
export function BuySuccess({
  token,
  receipt,
  onDone,
  doneLabel = "Done",
  onRetry,
  retrying = false,
}: {
  token: { name: string; symbol: string; imageUrl?: string | null };
  receipt: BuyReceipt;
  onDone: () => void;
  doneLabel?: string;
  /** Re-sends the ledger credit. Omitted when there's nothing to retry with. */
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { status } = receipt;
  const confirmed = status === "confirmed";

  return (
    <div className="buy-success space-y-5">
      {/* Mark + headline */}
      <div className="flex flex-col items-center pt-2 text-center">
        <div className="buy-success-mark flex h-16 w-16 items-center justify-center rounded-full border border-good/30 bg-good/15 shadow-[0_0_0_8px_rgba(12,163,12,0.06)]">
          <svg
            viewBox="0 0 24 24"
            className="h-8 w-8 text-good"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path className="buy-success-tick" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </div>

        <h3 className="mt-4 text-[18px] font-semibold leading-tight">
          You bought <span className="text-brand">{token.symbol}</span>
        </h3>

        <p className="mt-1 text-[12px] text-muted">
          {confirmed
            ? "Your position is recorded and live in your portfolio."
            : status === "confirming"
              ? "USDT sent. Recording your position…"
              : "USDT sent, but the position isn’t recorded yet."}
        </p>
      </div>

      {/* Order summary */}
      <div className="rounded-xl border border-line bg-surface2">
        <div className="flex items-center gap-3 border-b border-grid p-3.5">
          {token.imageUrl ? (
            <img
              src={token.imageUrl}
              alt={token.name}
              className="h-9 w-9 rounded-full"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/20 text-xs font-bold">
              {token.symbol.slice(0, 3)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold">
              {token.name}
            </div>

            <div className="text-[11px] text-muted">{token.symbol}</div>
          </div>

          <div className="text-right">
            <div className="num text-[15px] font-semibold text-good">
              +{fmtTokens(receipt.tokenAmount)}
            </div>

            <div className="text-[10px] text-muted">
              {confirmed ? "received" : "estimated"}
            </div>
          </div>
        </div>

        <div className="space-y-2.5 p-3.5 text-[12px]">
          <div className="flex justify-between">
            <span className="text-muted">You paid</span>

            <span className="num font-semibold">
              {receipt.amountUsdt != null
                ? `${receipt.amountUsdt.toFixed(2)} USDT`
                : "—"}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-muted">Price</span>

            <span className="num font-semibold">
              {fmtPrice(receipt.priceUsd)}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-muted">Status</span>

            {status === "confirming" && (
              <span className="flex items-center gap-2 text-ink2">
                <span className="pulse h-1.5 w-1.5 rounded-full bg-warn" />
                Confirming on-chain…
              </span>
            )}

            {status === "confirmed" && (
              <span className="flex items-center gap-2 font-semibold text-good">
                <span className="h-1.5 w-1.5 rounded-full bg-good" />
                Confirmed
              </span>
            )}

            {status === "unrecorded" && (
              <span className="flex items-center gap-2 font-semibold text-bad">
                <span className="h-1.5 w-1.5 rounded-full bg-bad" />
                Not recorded
              </span>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-grid pt-2.5">
            <span className="text-muted">Transaction</span>

            <a
              href={`https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="num text-brand hover:underline"
            >
              {receipt.signature.slice(0, 6)}…{receipt.signature.slice(-6)} ↗
            </a>
          </div>
        </div>
      </div>

      {/* Ledger credit failed — say so and offer the retry */}
      {status === "unrecorded" && (
        <div className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-[11.5px] leading-relaxed text-ink2">
          The USDT reached the vault, but the position wasn&apos;t recorded
          {receipt.reason ? `: ${receipt.reason}` : "."}{" "}
          {onRetry && (
            <button
              type="button"
              disabled={retrying}
              onClick={onRetry}
              className="font-semibold text-brand hover:underline disabled:opacity-50"
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onDone}
          className="rounded-xl border border-line2 px-4 py-3 text-[13px] font-semibold text-ink2 transition hover:bg-white/5 hover:text-ink"
        >
          {doneLabel}
        </button>

        <Link
          href="/portfolio"
          className="rounded-xl bg-accent px-4 py-3 text-center text-[13px] font-bold text-white transition hover:brightness-110"
        >
          View portfolio
        </Link>
      </div>

      <p className="text-center text-[10.5px] leading-relaxed text-faint">
        Solana Devnet — these assets have no real monetary value.
      </p>
    </div>
  );
}
