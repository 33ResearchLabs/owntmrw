"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "./wallet";
import { Logo } from "./ui";
import { CopyButton } from "./CopyButton";
import { fmtUsd, fmtNum, fmtPrice, shortAddr } from "@/lib/format";

/** One tracked token, with whatever price the server had at render. */
export interface PortfolioToken {
  slug: string;
  name: string;
  symbol: string | null;
  mint: string;
  image_url: string | null;
  price_usd: number | null;
}

interface Holding extends PortfolioToken {
  amount: number;
  value: number | null;
}

type ScanState = "idle" | "loading" | "done" | "failed";

/**
 * The connected wallet's position in the tokens this terminal tracks.
 *
 * Balances are read from the chain in the browser rather than stored: a
 * portfolio is the one figure on the site that belongs to the reader and not
 * to the archive, and persisting it would mean holding someone's holdings on
 * a server that has no reason to know them.
 *
 * Cost basis is deliberately absent rather than estimated. Every "PnL" here
 * would need the price paid at each acquisition, which needs the wallet's full
 * transaction history — the same parsed-indexer gap the wallet pages document.
 * A number derived from anything less would be a guess wearing a currency sign.
 */
export function Portfolio({ tokens }: { tokens: PortfolioToken[] }) {
  const w = useWallet();
  const { address, allTokenBalances } = w;
  // The scan is stamped with the wallet it belongs to, which lets the phase be
  // derived rather than stored: a result for a different address is by
  // definition still loading. Storing a "loading" flag would mean setting state
  // synchronously inside the effect, and it can disagree with the result it is
  // supposed to describe — showing one wallet's holdings under another's name
  // for a frame after an account switch.
  const [scan, setScan] = useState<{ owner: string; holdings: Holding[] | null } | null>(null);

  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    allTokenBalances().then((balances) => {
      if (cancelled) return;
      if (!balances) { setScan({ owner: address, holdings: null }); return; }
      const found = tokens
        .map((t) => {
          const amount = balances.get(t.mint) ?? 0;
          return { ...t, amount, value: t.price_usd != null ? amount * t.price_usd : null };
        })
        .filter((h) => h.amount > 0)
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
      setScan({ owner: address, holdings: found });
    });
    return () => { cancelled = true; };
  }, [address, allTokenBalances, tokens]);

  const state: ScanState = !address ? "idle"
    : scan?.owner !== address ? "loading"
      : scan.holdings === null ? "failed" : "done";
  const holdings = state === "done" ? scan!.holdings! : [];

  if (!address) {
    return (
      <div className="card px-6 py-10 text-center">
        <h2 className="text-[15px] font-semibold">No wallet connected</h2>
        <p className="mx-auto mt-1.5 max-w-md text-[12.5px] leading-relaxed text-muted">
          Connect a Solana wallet to see what you hold across the {tokens.length} tokens
          tracked here. Balances are read from the chain in your browser and never stored.
        </p>
        <button
          onClick={() => void w.connect()}
          disabled={w.connecting}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-bold text-white transition-[filter] duration-150 hover:brightness-[1.08] active:brightness-95 disabled:opacity-60"
        >
          {w.connecting ? "Connecting…" : w.available ? "Connect wallet" : "Get Phantom"}
        </button>
      </div>
    );
  }

  const tracked = holdings.reduce((s, h) => s + (h.value ?? 0), 0);
  // Cash and positions are kept apart: summing them would imply a single
  // "net worth" the site cannot stand behind, since any token without a live
  // quote contributes nothing and would silently understate the total.
  const priced = holdings.filter((h) => h.value != null).length;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Tracked positions" value={state === "loading" ? "…" : String(holdings.length)}
          sub={holdings.length ? `${priced} priced` : `of ${tokens.length} tokens`} />
        <Stat label="Position value" value={state === "done" ? fmtUsd(tracked) : "…"} sub="at live quotes" />
        <Stat label="USDC" value={w.usdcBalance != null ? fmtUsd(w.usdcBalance) : "—"} sub="wallet balance" />
        <Stat label="SOL" value={w.solBalance != null ? w.solBalance.toFixed(4) : "—"} sub="wallet balance" />
      </div>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-grid px-5 py-4">
          <h2 className="text-[15px] font-semibold">Your positions</h2>
          <span className="text-[11.5px] text-muted">
            {state === "loading" ? "reading chain…"
              : state === "failed" ? "balance read failed"
                : `scanned ${tokens.length} mints`}
          </span>
        </div>

        {state === "failed" ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">
            The public RPC did not answer. Nothing is shown rather than a zero
            balance, which would read as an empty wallet.
          </p>
        ) : state !== "done" ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">Reading balances…</p>
        ) : holdings.length === 0 ? (
          <p className="px-5 py-8 text-center text-[12.5px] text-muted">
            This wallet holds none of the {tokens.length} tokens tracked here.
          </p>
        ) : (
          <div className="scroll-x">
            <table className="itable text-[13px]">
              <thead>
                <tr>
                  <th>Token</th>
                  <th className="!text-right">Balance</th>
                  <th className="!text-right">Price</th>
                  <th className="!text-right">Value</th>
                  <th className="!text-right">Share</th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((h) => (
                  <tr key={h.mint}>
                    <td>
                      <Link href={`/project/${h.slug}`} className="flex items-center gap-2.5 hover:text-accent">
                        <Logo src={h.image_url} name={h.name} size={22} />
                        <span className="font-medium">{h.name}</span>
                        {h.symbol && <span className="text-[11px] text-muted">{h.symbol}</span>}
                      </Link>
                    </td>
                    <td className="num text-right">{fmtNum(h.amount)}</td>
                    <td className="num text-right text-ink2">{fmtPrice(h.price_usd)}</td>
                    <td className="num text-right">{h.value != null ? fmtUsd(h.value) : "—"}</td>
                    <td className="num text-right text-muted">
                      {h.value != null && tracked > 0 ? `${((h.value / tracked) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="border-t border-grid px-5 py-3 text-[11px] leading-relaxed text-muted">
          Balances are read live from the chain in your browser and never stored.
          Cost basis, realised PnL and hold duration are not shown: they need the
          price paid at every acquisition, which requires this wallet&rsquo;s full
          transaction history from a parsed-transaction indexer.
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
        <span className="num">{shortAddr(address)}</span>
        <CopyButton value={address} />
        <Link href={`/wallet/${address}`} className="text-accent hover:underline">
          public wallet page →
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="text-[10.5px] uppercase tracking-[0.08em] text-muted">{label}</div>
      <div className="num mt-2 text-[22px] font-bold tracking-tight">{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-muted">{sub}</div>}
    </div>
  );
}
