"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "./wallet";

interface InvestModalProps {
  open: boolean;
  onClose: () => void;
  token: {
    mint: string;
    name: string;
    symbol: string;
    priceUsd?: number | null;
    imageUrl?: string | null;
  };
  onSuccess?: (signature: string) => void;
}

export function InvestModal({
  open,
  onClose,
  token,
  onSuccess,
}: InvestModalProps) {
  const w = useWallet();

  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setAmount("");
      setError(null);
      setSuccess(null);
      setLoading(false);
    }
  }, [open]);

  const numericAmount = Number(amount);

  const [usdtBalance, setMaxUsdtBalance] = useState(0);

  console.log("[TRADE] USDT BALANCE:", usdtBalance);

  useEffect(() => {
    let cancelled = false;

    async function loadMaxUsdtBalance() {
      try {
        if (!w.address) {
          if (!cancelled) {
            setMaxUsdtBalance(0);
          }
          return;
        }

        const balances = await w.allTokenBalances();

        console.log("[TRADE] WALLET:", w.address);
        console.log("[TRADE] TOKEN BALANCES:", balances);
        console.log("[TRADE] IS MAP:", balances instanceof Map);

        if (!balances) {
          if (!cancelled) {
            setMaxUsdtBalance(0);
          }
          return;
        }

        let entries: Array<{
          mint: string;
          balance: number;
        }> = [];

        /**
         * allTokenBalances() returns:
         *
         * Map<string, number>
         *
         * Example:
         *
         * Map(5) {
         *   "FT8..." => 2.241759,
         *   "FMz7..." => 1000000,
         *   "J3ev..." => 30.95,
         *   "JCqd..." => 1797778,
         *   "Hozv..." => 4
         * }
         */
        if (balances instanceof Map) {
          entries = Array.from(balances.entries())
            .map(([mint, value]) => ({
              mint,
              balance: Number(value),
            }))
            .filter(
              ({ mint, balance }) =>
                Boolean(mint) && Number.isFinite(balance) && balance > 0,
            );
        } else if (Array.isArray(balances)) {
          /**
           * Fallback in case the wallet provider
           * returns an array in the future.
           */
          entries = (balances as Array<any>)
            .map((item: any) => ({
              mint: String(item.mint ?? ""),
              balance: Number(
                item.balance ?? item.uiAmount ?? item.amount ?? 0,
              ),
            }))
            .filter(
              ({ mint, balance }) =>
                Boolean(mint) && Number.isFinite(balance) && balance > 0,
            );
        } else if (typeof balances === "object") {
          /**
           * Fallback for normal object format.
           */
          entries = Object.entries(balances)
            .map(([mint, value]) => ({
              mint,
              balance: Number(value),
            }))
            .filter(
              ({ mint, balance }) =>
                Boolean(mint) && Number.isFinite(balance) && balance > 0,
            );
        }

        console.log("[TRADE] TOKEN ENTRIES:", entries);

        if (entries.length === 0) {
          console.log("[TRADE] No token balances found.");

          if (!cancelled) {
            setMaxUsdtBalance(0);
          }

          return;
        }

        /**
         * Find the largest token balance.
         */
        const maxToken = entries.reduce((largest, current) =>
          current.balance > largest.balance ? current : largest,
        );

        console.log("[TRADE] MAX TOKEN:", maxToken);

        if (!cancelled) {
          setMaxUsdtBalance(maxToken.balance);
        }
      } catch (error) {
        console.error("[TRADE] Failed to load token balances:", error);

        if (!cancelled) {
          setMaxUsdtBalance(0);
        }
      }
    }

    loadMaxUsdtBalance();

    return () => {
      cancelled = true;
    };
  }, [w.address, w.allTokenBalances]);

  const validAmount =
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    numericAmount <= usdtBalance;

  const estimatedTokens = useMemo(() => {
    if (!validAmount || !token.priceUsd || token.priceUsd <= 0) {
      return null;
    }

    return numericAmount / token.priceUsd;
  }, [numericAmount, token.priceUsd, validAmount]);

  if (!open) return null;

  async function invest() {
    setError(null);
    setSuccess(null);

    if (!w.address) {
      setError("Connect your wallet first.");
      return;
    }
    console.log(usdtBalance);
    if (!validAmount) {
      console.log(usdtBalance);
      setError(
        numericAmount > usdtBalance
          ? "Insufficient USDT balance."
          : "Enter a valid investment amount.",
      );
      return;
    }

    if (!w.signAndSendTransaction) {
      setError("Wallet transaction signing is not available.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("/api/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          owner: w.address,
          tokenMint: token.mint,
          amountUsdt: numericAmount,
          slippageBps: Math.round(Number(slippage) * 100),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data?.error || "Unable to create investment transaction.",
        );
      }

      if (!data.transaction) {
        throw new Error("Server did not return a transaction.");
      }

      const signature = await w.signAndSendTransaction(data.transaction);

      setSuccess(signature);

      onSuccess?.(signature);
    } catch (err) {
      console.error("Investment failed:", err);

      setError(err instanceof Error ? err.message : "Investment failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-grid px-5 py-4">
          <div>
            <h2 className="text-[16px] font-semibold">
              Invest in {token.name}
            </h2>

            <p className="mt-0.5 text-[11.5px] text-muted">Devnet investment</p>
          </div>

          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg px-2 py-1 text-muted hover:bg-white/5 hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Token */}
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface2 p-3">
            <div className="flex items-center gap-3">
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

              <div>
                <div className="text-[13px] font-semibold">{token.name}</div>

                <div className="text-[11px] text-muted">{token.symbol}</div>
              </div>
            </div>

            {token.priceUsd != null && (
              <div className="text-right">
                <div className="num text-[12.5px] font-semibold">
                  ${token.priceUsd.toFixed(6)}
                </div>

                <div className="text-[10px] text-muted">price</div>
              </div>
            )}
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted">Available USDT</span>

            <span className="num font-semibold">
              {usdtBalance.toFixed(4)} USDT
            </span>
          </div>

          {/* Amount */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-[12px] font-medium">
                Investment amount
              </label>

              <button
                type="button"
                onClick={() =>
                  setAmount(Math.max(usdtBalance - 0.01, 0).toFixed(2))
                }
                className="text-[11px] text-brand hover:underline"
              >
                MAX
              </button>
            </div>

            <div className="flex items-center rounded-xl border border-line2 bg-surface2 px-3">
              <input
                value={amount}
                onChange={(e) =>
                  setAmount(e.target.value.replace(/[^0-9.]/g, ""))
                }
                inputMode="decimal"
                placeholder="0.00"
                className="num w-full bg-transparent py-3 text-[18px] font-semibold outline-none"
              />

              <span className="text-[12px] font-semibold text-muted">USDT</span>
            </div>
          </div>

          {/* Estimated output */}
          <div className="rounded-xl border border-line bg-surface2 p-4">
            <div className="flex justify-between text-[12px]">
              <span className="text-muted">You invest</span>

              <span className="num font-semibold">
                {validAmount ? `${numericAmount.toFixed(2)} USDT` : "—"}
              </span>
            </div>

            <div className="mt-3 flex justify-between text-[12px]">
              <span className="text-muted">Estimated {token.symbol}</span>

              <span className="num font-semibold">
                {estimatedTokens != null ? estimatedTokens.toFixed(6) : "—"}
              </span>
            </div>

            <div className="mt-3 flex justify-between text-[12px]">
              <span className="text-muted">Slippage</span>

              <select
                value={slippage}
                onChange={(e) => setSlippage(e.target.value)}
                className="rounded-md border border-line2 bg-surface px-2 py-1 text-[11px] outline-none"
              >
                <option value="0.1">0.1%</option>
                <option value="0.5">0.5%</option>
                <option value="1">1%</option>
                <option value="2">2%</option>
              </select>
            </div>
          </div>

          {/* Warning */}
          <div className="rounded-xl border border-warn/30 bg-warn/5 p-3 text-[11px] leading-relaxed text-muted">
            This transaction uses Solana Devnet. Devnet assets have no real
            monetary value.
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-xl border border-bad/30 bg-bad/5 p-3 text-[12px] text-bad">
              {error}
            </div>
          )}

          {/* Success */}
          {success && (
            <div className="rounded-xl border border-good/30 bg-good/5 p-3">
              <div className="text-[12px] font-semibold text-good">
                Investment transaction submitted.
              </div>

              <div className="mt-1 break-all text-[10px] text-muted">
                {success}
              </div>
            </div>
          )}

          {/* Button */}
          <button
            onClick={() => void invest()}
            disabled={loading || !validAmount || !!success}
            className="w-full rounded-xl bg-accent px-4 py-3 text-[13px] font-bold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading
              ? "Waiting for Phantom…"
              : success
                ? "Investment submitted"
                : "Invest"}
          </button>
        </div>
      </div>
    </div>
  );
}
