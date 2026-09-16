/**
 * Buys whose USDT has left the wallet but whose ledger credit has not been
 * confirmed by the server yet.
 *
 * The on-chain leg and the ledger leg of a buy are two separate steps: the
 * wallet sends the USDT, then the page asks `/api/swap/confirm` to credit
 * the position. Anything that interrupts the second step — a reload, a
 * deploy that lapses the session, a server that answers 409 because the
 * cluster hadn't confirmed yet, a flaky connection — leaves real USDT in
 * the vault and no position, and the page that knew about it is gone.
 *
 * So the moment a signature exists it is written here, and removed only
 * once the server has recorded it. `flushPendingBuys` re-drives whatever is
 * left the next time a session is known. The confirm route is idempotent
 * on the signature, so re-sending is always safe.
 *
 * Browser-only: every call touches localStorage and swallows its failures,
 * because a private window with storage blocked must not break a buy.
 */

export interface PendingBuy {
  signature: string;
  /** Wallet that paid. Flushed only for a session on the same address. */
  address: string;
  tokenMint: string;
  amountUsdt: number;
  priceUsd: number | null;
  /** When it was queued, ms since epoch. */
  ts: number;
}

const KEY = "owntmrw_pending_buys";

/**
 * A week. RPC nodes prune transaction history, so an entry that hasn't
 * settled by then won't be found on retry either; keeping it would only
 * cost a failed request on every page load.
 */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isPendingBuy(v: unknown): v is PendingBuy {
  if (!v || typeof v !== "object") return false;
  const b = v as Record<string, unknown>;
  return (
    typeof b.signature === "string" &&
    b.signature.length > 0 &&
    typeof b.address === "string" &&
    typeof b.tokenMint === "string" &&
    typeof b.amountUsdt === "number" &&
    Number.isFinite(b.amountUsdt) &&
    (b.priceUsd === null || typeof b.priceUsd === "number") &&
    typeof b.ts === "number"
  );
}

function read(): PendingBuy[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - MAX_AGE_MS;
    return parsed.filter(isPendingBuy).filter((b) => b.ts >= cutoff);
  } catch {
    return [];
  }
}

function write(list: PendingBuy[]) {
  try {
    if (list.length === 0) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable — the in-memory receipt is still the fallback */
  }
}

export function listPendingBuys(): PendingBuy[] {
  return read();
}

/** Queue a buy. A signature already queued is left as it was. */
export function addPendingBuy(b: Omit<PendingBuy, "ts">) {
  const list = read();
  if (list.some((x) => x.signature === b.signature)) return;
  write([...list, { ...b, ts: Date.now() }]);
}

export function removePendingBuy(signature: string) {
  const list = read();
  const next = list.filter((x) => x.signature !== signature);
  if (next.length !== list.length) write(next);
}

export type ConfirmOutcome =
  | { ok: true; tokenAmount: number; alreadyRecorded: boolean }
  | {
      ok: false;
      status: number;
      error: string;
      /**
       * True when retrying can never succeed — the server rejected the
       * transaction itself (malformed signature, failed on-chain, signed by
       * another wallet), not the moment. Callers drop the entry on final.
       */
      final: boolean;
    };

/**
 * One request to `/api/swap/confirm`. The server itself waits up to 25s for
 * the cluster to confirm, so a single call is usually enough; a 409 means
 * it still wasn't, and is worth another try later rather than now.
 */
export async function confirmBuy(
  b: Pick<PendingBuy, "signature" | "tokenMint" | "amountUsdt" | "priceUsd">,
): Promise<ConfirmOutcome> {
  try {
    const res = await fetch("/api/swap/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        signature: b.signature,
        tokenMint: b.tokenMint,
        amountUsdt: b.amountUsdt,
        priceUsd: b.priceUsd,
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      error?: string;
      tokenAmount?: number;
      alreadyRecorded?: boolean;
    } | null;

    if (res.ok) {
      return {
        ok: true,
        tokenAmount: body?.tokenAmount ?? 0,
        alreadyRecorded: body?.alreadyRecorded === true,
      };
    }
    return {
      ok: false,
      status: res.status,
      error: body?.error ?? `HTTP ${res.status}`,
      // 400 = the transaction is bad, 403 = not this wallet's. Everything
      // else (401 signed out, 409 not confirmed yet, 5xx, network) is about
      // now, not the transaction.
      final: res.status === 400 || res.status === 403,
    };
  } catch (err) {
    return {
      ok: false,
      status: 0,
      error: err instanceof Error ? err.message : "Network error.",
      final: false,
    };
  }
}

/**
 * Queue a buy and try to settle it once. Returns the outcome so a caller
 * with a UI can show it; the entry stays queued unless the server recorded
 * it or rejected the transaction outright.
 */
export async function settleBuy(
  b: Omit<PendingBuy, "ts">,
): Promise<ConfirmOutcome> {
  addPendingBuy(b);
  const outcome = await confirmBuy(b);
  if (outcome.ok || outcome.final) removePendingBuy(b.signature);
  return outcome;
}

/**
 * Re-drive every queued buy for `address`. Stops at the first 401 — the
 * session is gone and every later entry would fail the same way. Returns
 * how many the server recorded this pass (including ones it already had).
 */
export async function flushPendingBuys(address: string): Promise<number> {
  const mine = read().filter((b) => b.address === address);
  let settled = 0;
  for (const b of mine) {
    const outcome = await confirmBuy(b);
    if (outcome.ok) {
      removePendingBuy(b.signature);
      settled++;
      continue;
    }
    if (outcome.final) {
      removePendingBuy(b.signature);
      continue;
    }
    if (outcome.status === 401) break;
  }
  return settled;
}
