"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "./wallet";
import { useSignIn } from "./SignInProvider";
import { fmtUsd, fmtNum, shortAddr } from "@/lib/format";
import { Transaction } from "@solana/web3.js";

/**
 * Trading terminal.
 *
 * BUY:
 *   USDT -> investment transaction -> Phantom -> /api/swap/confirm credits a
 *   simulated position.
 *
 *   There's no vault inventory or mint authority for any tracked project
 *   token, so the real leg is only the USDT transfer into the vault; the
 *   token side is a ledger position recorded server-side once that transfer
 *   is confirmed on-chain (see /api/swap/confirm and `ledger_trades` in
 *   db.ts).
 *
 * SELL:
 *   Debits the same simulated position via /api/swap/sell. No USDT is sent
 *   back — that would need the vault to co-sign, which needs a private key
 *   this app doesn't have.
 */
export function TradeTerminal({
  symbol,
  mint,
  price,
  liquidity,
  vol24h,
}: {
  symbol: string;
  mint: string | null;
  price: number | null;
  liquidity: number | null;
  vol24h: number | null;
}) {
  const w = useWallet();
  const signIn = useSignIn();

  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState("0.5");
  const [held, setHeld] = useState<number | null>(null);

  const [executing, setExecuting] = useState(false);

  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [sellClosed, setSellClosed] = useState(false);

  const [error, setError] = useState<string | null>(null);

  /*
   * A connected wallet is not a signed-in one (Phantom reconnects silently
   * for a site it already trusts), and a session names one wallet — if the
   * user switches accounts in Phantom afterwards, `address` moves and
   * `session` does not. Trading requires both: the same convention
   * ConnectButton uses for the header.
   */
  const stale =
    w.session != null && w.address != null && w.address !== w.session;

  const ready = w.session != null && !stale;

  /*
   * Read this token's simulated position whenever the
   * wallet or project changes. This is what a sell debits —
   * see the file header for why it isn't the real on-chain balance.
   */
  useEffect(() => {
    let alive = true;

    if (ready && mint) {
      void w
        .ledgerBalance(mint)
        .then((balance) => {
          if (alive) {
            setHeld(balance);
          }
        })
        .catch(() => {
          if (alive) {
            setHeld(null);
          }
        });
    } else {
      setHeld(null);
    }

    return () => {
      alive = false;
    };
  }, [ready, mint, w]);

  const amt = Number(amount) || 0;

  /*
   * Estimated output.
   */
  const receive = useMemo(() => {
    if (!price || amt <= 0) {
      return null;
    }

    return side === "buy" ? amt / price : amt * price;
  }, [amt, price, side]);

  /*
   * Share of pool depth this order represents.
   */
  const impact = useMemo(() => {
    if (!liquidity || liquidity <= 0 || amt <= 0) {
      return null;
    }

    const usd = side === "buy" ? amt : amt * (price ?? 0);

    return (usd / liquidity) * 100;
  }, [amt, liquidity, price, side]);

  const inCcy = side === "buy" ? "USDT" : symbol;

  const outCcy = side === "buy" ? symbol : "USDT";

  const [maxUsdtBalance, setMaxUsdtBalance] = useState(0);

  console.log("[TRADE] USDT BALANCE:", maxUsdtBalance);

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

        /*
         * IMPORTANT:
         *
         * The wallet provider returns a Map at runtime:
         *
         * Map<string, number>
         *
         * But the current TypeScript definition of
         * allTokenBalances is not correctly typed.
         *
         * Therefore we intentionally treat the returned
         * value as unknown and normalize it safely here.
         */
        const rawBalances: unknown = await w.allTokenBalances();

        console.log("[TRADE] WALLET:", w.address);
        console.log("[TRADE] TOKEN BALANCES:", rawBalances);

        let entries: Array<{
          mint: string;
          balance: number;
        }> = [];

        /*
         * ============================================================
         * MAP
         * ============================================================
         */

        if (rawBalances instanceof Map) {
          entries = Array.from(rawBalances.entries())
            .map(([mint, value]: [unknown, unknown]) => ({
              mint: String(mint),
              balance: Number(value),
            }))
            .filter(
              ({ mint, balance }) =>
                mint.length > 0 && Number.isFinite(balance) && balance > 0,
            );
        } else if (Array.isArray(rawBalances)) {
          /*
           * ============================================================
           * ARRAY
           * ============================================================
           *
           * Supports:
           *
           * [
           *   { mint: "...", balance: 100 },
           *   ...
           * ]
           */
          entries = rawBalances
            .map((item: unknown) => {
              if (!item || typeof item !== "object") {
                return null;
              }

              const record = item as Record<string, unknown>;

              const mint = String(record.mint ?? "");

              const balance = Number(
                record.balance ?? record.uiAmount ?? record.amount ?? 0,
              );

              return {
                mint,
                balance,
              };
            })
            .filter(
              (
                item,
              ): item is {
                mint: string;
                balance: number;
              } =>
                item !== null &&
                item.mint.length > 0 &&
                Number.isFinite(item.balance) &&
                item.balance > 0,
            );
        } else if (rawBalances !== null && typeof rawBalances === "object") {
          /*
           * ============================================================
           * OBJECT
           * ============================================================
           *
           * Supports:
           *
           * {
           *   "mint1": 100,
           *   "mint2": 500
           * }
           */
          entries = Object.entries(rawBalances as Record<string, unknown>)
            .map(([mint, value]) => ({
              mint,
              balance: Number(value),
            }))
            .filter(
              ({ mint, balance }) =>
                mint.length > 0 && Number.isFinite(balance) && balance > 0,
            );
        }

        console.log("[TRADE] TOKEN ENTRIES:", entries);

        /*
         * No tokens
         */

        if (entries.length === 0) {
          console.log("[TRADE] No token balances found.");

          if (!cancelled) {
            setMaxUsdtBalance(0);
          }

          return;
        }

        /*
         * ============================================================
         * MAX TOKEN
         * ============================================================
         *
         * For your current Devnet setup, the largest token balance
         * is being treated as the available USDT balance.
         *
         * Example:
         *
         * 30.95
         * 1,000,000
         * 1,797,778  <-- selected
         * 4
         *
         * Result:
         *
         * maxUsdtBalance = 1,797,778
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

    void loadMaxUsdtBalance();

    return () => {
      cancelled = true;
    };
  }, [w.address]);
  /*
   * Validate the buy amount.
   */
  console.log(maxUsdtBalance);
  const buyAmountValid = side === "buy" && amt > 0 && amt <= maxUsdtBalance;
  console.log(buyAmountValid);
  /*
   * Validate the sell amount against the simulated position.
   */
  const sellAmountValid = side === "sell" && amt > 0 && amt <= (held ?? 0);

  /*
   * Decode the base64 transaction returned
   * from the server.
   */
  function decodeTransaction(encoded: string): Transaction {
    const binary = window.atob(encoded);

    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return Transaction.from(bytes);
  }

  /*
   * Execute BUY.
   *
   * The server builds the Devnet transaction.
   * Phantom signs and broadcasts it.
   */
  async function executeBuy() {
    setError(null);
    setTxSignature(null);
    setSellClosed(false);

    if (!ready) {
      setError("Sign in first.");
      return;
    }

    if (!w.address) {
      setError("Connected wallet address is missing.");
      return;
    }

    if (!mint) {
      setError("This token does not have a mint address.");
      return;
    }

    if (amt <= 0) {
      setError("Enter an investment amount.");
      return;
    }

    if (amt > maxUsdtBalance) {
      console.log(maxUsdtBalance);
      setError(
        `Insufficient USDT balance. Max available is ${maxUsdtBalance.toFixed(4)} USDT.`,
      );
      return;
    }

    /*
     * We need a signing method from the wallet provider.
     */
    const walletWithSigning = w as typeof w & {
      signAndSendTransaction?: (transaction: Transaction) => Promise<string>;

      signTransaction?: (transaction: Transaction) => Promise<Transaction>;
    };

    setExecuting(true);

    try {
      /*
       * Ask our server to build the transaction.
       */
      const response = await fetch("/api/swap", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          owner: w.address,
          tokenMint: mint,
          amountUsdt: amt,
          slippageBps: Math.round(Number(slippage) * 100),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Unable to create transaction.");
      }

      if (!data.transaction) {
        throw new Error("Server did not return a transaction.");
      }

      const transaction = decodeTransaction(data.transaction);

      let signature: string;

      /*
       * Preferred method.
       *
       * Your wallet provider can directly
       * sign + send the transaction.
       */
      if (walletWithSigning.signAndSendTransaction) {
        signature = await walletWithSigning.signAndSendTransaction(transaction);
      } else if (walletWithSigning.signTransaction) {
        /*
         * Fallback:
         *
         * Sign first, then send using the
         * Phantom provider directly.
         */
        const signed = await walletWithSigning.signTransaction(transaction);

        const provider = (
          window as Window & {
            solana?: {
              publicKey?: {
                toString(): string;
              };
              signTransaction?: (tx: Transaction) => Promise<Transaction>;
            };
          }
        ).solana;

        if (!provider) {
          throw new Error("Phantom wallet provider was not found.");
        }

        /*
         * The provider has already signed the
         * transaction through wallet.tsx.
         *
         * We need a send method for the signed tx.
         */
        const connectionResponse = await fetch("/api/swap", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            signature: null,
          }),
        });

        /*
         * This branch should normally not be
         * reached when signAndSendTransaction
         * exists.
         */
        if (!connectionResponse.ok) {
          throw new Error(
            "Wallet provider cannot broadcast the signed transaction.",
          );
        }

        void signed;

        throw new Error(
          "Your wallet provider exposes signTransaction but not signAndSendTransaction. Add signAndSendTransaction to wallet.tsx.",
        );
      } else {
        throw new Error(
          "Wallet provider does not support transaction signing.",
        );
      }

      setTxSignature(signature);

      /*
       * Clear the input after successful
       * submission.
       */
      setAmount("");

      /*
       * Credit the simulated position now that the USDT transfer is
       * confirmed on-chain. This is best-effort: the USDT has already
       * moved, so a failure here shouldn't read as a failed trade — it
       * means the position didn't get recorded and the user should see
       * their real transaction rather than a scary error.
       */
      try {
        const confirmRes = await fetch("/api/swap/confirm", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          cache: "no-store",
          body: JSON.stringify({
            signature,
            tokenMint: mint,
            amountUsdt: amt,
            priceUsd: price,
          }),
        });

        if (confirmRes.ok) {
          setHeld(await w.ledgerBalance(mint!));
        } else {
          console.error(
            "[TRADE] Position not recorded:",
            await confirmRes.text(),
          );
        }
      } catch (confirmError) {
        console.error("[TRADE] Position not recorded:", confirmError);
      }

      /*
       * Refresh wallet/session data if your
       * provider exposes refreshBalances.
       */
      const walletWithRefresh = w as typeof w & {
        refreshBalances?: () => Promise<void>;
      };

      if (walletWithRefresh.refreshBalances) {
        await walletWithRefresh.refreshBalances();
      }

      /*
       * Refresh the current page so the
       * portfolio/project data updates.
       */
      window.dispatchEvent(
        new CustomEvent("wallet-transaction", {
          detail: {
            signature,
            tokenMint: mint,
          },
        }),
      );
    } catch (err) {
      console.error("[TRADE] Buy failed:", err);

      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Transaction failed.");
      }
    } finally {
      setExecuting(false);
    }
  }

  /*
   * Close (part of) the simulated position. No USDT moves — see the file
   * header for why.
   */
  async function executeSell() {
    setError(null);
    setSellClosed(false);

    if (!ready) {
      setError("Sign in first.");
      return;
    }

    if (!mint) {
      setError("This token does not have a mint address.");
      return;
    }

    if (amt <= 0) {
      setError("Enter an amount to sell.");
      return;
    }

    if (amt > (held ?? 0)) {
      setError(
        `You only hold a simulated position of ${(held ?? 0).toFixed(4)} ${symbol} here.`,
      );
      return;
    }

    setExecuting(true);

    try {
      const res = await fetch("/api/swap/sell", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({
          tokenMint: mint,
          tokenAmount: amt,
          priceUsd: price,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data?.error || "Unable to close the position.");
      }

      setAmount("");
      setSellClosed(true);
      setHeld(await w.ledgerBalance(mint));

      window.dispatchEvent(
        new CustomEvent("wallet-transaction", {
          detail: {
            signature: null,
            tokenMint: mint,
          },
        }),
      );
    } catch (err) {
      console.error("[TRADE] Sell failed:", err);

      setError(
        err instanceof Error ? err.message : "Unable to close the position.",
      );
    } finally {
      setExecuting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Side selector */}
      <div className="flex gap-1 rounded-xl border border-line bg-page/60 p-1">
        {(["buy", "sell"] as const).map((s) => {
          const on = side === s;

          return (
            <button
              key={s}
              onClick={() => {
                setSide(s);
                setError(null);
                setTxSignature(null);
                setSellClosed(false);
              }}
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

      {/* Amount */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-[11px] uppercase tracking-[0.07em] text-faint">
            You pay
          </label>

          <span className="text-[11px] text-faint">{inCcy}</span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-page/60 px-3.5 py-2.5 focus-within:border-accent/50">
          <input
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ""));

              setError(null);
              setTxSignature(null);
              setSellClosed(false);
            }}
            placeholder="0.00"
            inputMode="decimal"
            className="num min-w-0 flex-1 bg-transparent text-[17px] font-semibold text-ink outline-none placeholder:text-faint"
          />

          <span className="text-[12.5px] font-semibold text-muted">
            {inCcy}
          </span>
        </div>

        {/* Presets */}
        <div className="mt-2 flex gap-1.5">
          {(["1", "5", "10", "25"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setAmount(v)}
              disabled={side === "buy" && Number(v) > maxUsdtBalance}
              className="flex-1 rounded-lg border border-line py-1 text-[11.5px] text-muted transition-colors hover:border-line2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
            >
              {side === "buy" ? `$${v}` : v}
            </button>
          ))}
        </div>

        {side === "buy" && ready && (
          <div className="mt-2 flex justify-between text-[10.5px] text-faint">
            <span>Available</span>

            <span className="num">{maxUsdtBalance.toFixed(4)} USDT</span>
          </div>
        )}

        {side === "sell" && ready && (
          <div className="mt-2 flex justify-between text-[10.5px] text-faint">
            <span>Simulated position</span>

            <span className="num">
              {held != null ? `${fmtNum(held)} ${symbol}` : "…"}
            </span>
          </div>
        )}
      </div>

      {/* Receive */}
      <div>
        <div className="mb-1.5 flex items-baseline justify-between">
          <label className="text-[11px] uppercase tracking-[0.07em] text-faint">
            You receive
          </label>

          <span className="text-[11px] text-faint">estimated</span>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-line bg-page/60 px-3.5 py-2.5">
          <span className="num min-w-0 flex-1 truncate text-[17px] font-semibold">
            {receive != null ? (
              side === "buy" ? (
                fmtNum(receive)
              ) : (
                fmtUsd(receive, {
                  compact: false,
                })
              )
            ) : (
              <span className="text-faint">—</span>
            )}
          </span>

          <span className="text-[12.5px] font-semibold text-muted">
            {outCcy}
          </span>
        </div>
      </div>

      {/* Order detail */}
      <div className="space-y-2 rounded-xl border border-line bg-page/40 px-3.5 py-3">
        <Row label="Price">
          <span className="num">
            {price != null
              ? fmtUsd(price, {
                  compact: false,
                })
              : "—"}
          </span>
        </Row>

        <Row label="Slippage">
          <span className="flex gap-1">
            {(["0.5", "1", "3"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`num rounded px-1.5 py-0.5 text-[11.5px] ${
                  slippage === s
                    ? "bg-white/10 text-ink"
                    : "text-muted hover:text-ink2"
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
            <span
              className={`num font-semibold ${
                impact > 5 ? "text-bad" : impact > 1 ? "text-warn" : "text-good"
              }`}
            >
              {impact < 0.01 ? "<0.01" : impact.toFixed(2)}%
            </span>
          </Row>
        )}

        <Row label="Route">
          <span className="text-muted">
            {side === "buy"
              ? "Devnet investment"
              : "Simulated position (no funds move)"}
          </span>
        </Row>
      </div>

      {/* Large order warning */}
      {impact != null && impact > 5 && (
        <p className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-[11.5px] leading-relaxed text-ink2">
          This order is {impact.toFixed(0)}% of total pool depth and would move
          the price materially against you.
        </p>
      )}

      {/* Wallet */}
      {ready ? (
        <>
          <div className="flex items-center justify-between rounded-xl border border-line bg-page/40 px-3.5 py-2.5 text-[12.5px]">
            <span className="flex items-center gap-2 text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-good" />

              {shortAddr(w.session!)}
            </span>

            <span className="num text-ink2">
              {side === "buy"
                ? `${maxUsdtBalance.toFixed(4)} USDT`
                : held != null
                  ? `${fmtNum(held)} ${symbol}`
                  : "…"}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-bad/30 bg-bad/5 px-3 py-2.5 text-[11.5px] leading-relaxed text-bad">
              {error}
            </div>
          )}

          {/* Success */}
          {txSignature && (
            <div className="rounded-lg border border-good/30 bg-good/5 px-3 py-2.5">
              <div className="text-[11.5px] font-semibold text-good">
                Transaction submitted successfully.
              </div>

              <a
                href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block truncate text-[10.5px] text-brand hover:underline"
              >
                View transaction ↗
              </a>
            </div>
          )}

          {sellClosed && (
            <div className="rounded-lg border border-good/30 bg-good/5 px-3 py-2.5 text-[11.5px] font-semibold text-good">
              Simulated position closed.
            </div>
          )}

          {/* Execute */}
          <button
            onClick={() => {
              if (side === "buy") {
                void executeBuy();
              } else {
                void executeSell();
              }
            }}
            disabled={
              executing ||
              !mint ||
              (side === "buy" ? !buyAmountValid : !sellAmountValid)
            }
            title={
              side === "buy" && amt > maxUsdtBalance
                ? "Insufficient USDT balance"
                : side === "sell" && amt > (held ?? 0)
                  ? "Exceeds your simulated position"
                  : undefined
            }
            className={`w-full rounded-xl py-2.5 text-[13px] font-bold text-white transition-all ${
              executing ||
              !mint ||
              (side === "buy" ? !buyAmountValid : !sellAmountValid)
                ? "cursor-not-allowed bg-accent/40 opacity-60"
                : side === "buy"
                  ? "bg-accent hover:bg-accenthi"
                  : "bg-bad/80 hover:bg-bad"
            }`}
          >
            {executing
              ? side === "buy"
                ? "Confirm in Phantom…"
                : "Closing…"
              : side === "buy"
                ? `Buy ${symbol}`
                : `Sell ${symbol}`}
          </button>
        </>
      ) : (
        <button
          onClick={() => signIn.open()}
          disabled={w.signingIn}
          className="w-full rounded-xl bg-accent py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-accenthi disabled:opacity-60"
        >
          {w.signingIn
            ? "Check your wallet…"
            : stale
              ? "Wallet changed — reconnect to trade"
              : w.available
                ? "Sign in to trade"
                : "Get Phantom to trade"}
        </button>
      )}

      {/* Devnet notice */}
      <p className="text-[11px] leading-relaxed text-faint">
        Buying sends real USDT on Solana Devnet into the app&rsquo;s vault; the
        {` ${symbol} `}
        side is a simulated position tracked here, since there&rsquo;s no
        on-chain inventory of it to actually deliver. Selling closes that
        position and does not send USDT back.
      </p>

      {/* External execution */}
      {mint && (
        <div className="border-t border-grid pt-3.5">
          <div className="mb-2 text-[10.5px] uppercase tracking-[0.08em] text-faint">
            Execute elsewhere
          </div>

          <div className="flex flex-wrap gap-2">
            <a
              href={`https://jup.ag/swap/USDT-${mint}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-line py-1.5 text-center text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-brand"
            >
              Jupiter ↗
            </a>

            <a
              href={`https://metadao.fi/${symbol.toLowerCase()}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-lg border border-line py-1.5 text-center text-[12px] text-ink2 transition-colors hover:border-accent/50 hover:text-brand"
            >
              MetaDAO ↗
            </a>
          </div>
        </div>
      )}

      {/* Activity */}
      <div className="border-t border-grid pt-3.5">
        <div className="mb-1.5 flex items-baseline justify-between">
          <span className="text-[10.5px] uppercase tracking-[0.08em] text-faint">
            24h activity
          </span>
        </div>

        <div className="flex items-baseline justify-between text-[12.5px]">
          <span className="text-muted">Volume</span>

          <span className="num font-semibold">{fmtUsd(vol24h)}</span>
        </div>

        <p className="mt-2 text-[11px] leading-relaxed text-faint">
          Trading execution is currently connected to the Devnet investment
          transaction flow.
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[12.5px]">
      <span className="text-muted">{label}</span>

      {children}
    </div>
  );
}
