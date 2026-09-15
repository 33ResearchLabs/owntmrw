import nacl from "tweetnacl";
import bs58 from "bs58";
import { wdebug } from "./walletDebug";

/**
 * Phone-browser wallet connection over the Phantom deeplink protocol.
 *
 * A phone browser cannot run a wallet extension, so nothing injects
 * `window.phantom` there. Phantom, Solflare and Backpack all implement the
 * same universal-link protocol instead: the site makes an X25519 keypair,
 * sends the wallet app an encrypted request as `https://<wallet>/ul/v1/...`,
 * the app shows its approval screen, and then opens `redirect_link` — this
 * page — with the encrypted answer in the query string.
 *
 * That last step is the whole design constraint. Unlike an extension (or a
 * relay socket), the answer arrives as a *page load*, so every request has
 * to persist enough state to `localStorage` that the page can pick up where
 * it left off with no React state at all — see `Pending` and
 * `consumeRedirect`. The provider built here implements the same interface
 * as an injected wallet (`connect`, `signMessage`, `signAndSendTransaction`,
 * ...) so the rest of the app never needs to know which one it is talking
 * to; the only visible difference is that a call which has to visit the app
 * never resolves — the page is leaving — and the caller's flow resumes from
 * the persisted record on the next load.
 *
 * Three other things this handles that the protocol does not spell out:
 *
 * - The tap gate. Safari and Chrome only let a page open another app inside
 *   a few seconds of a real tap. Connect fires from the tap on the wallet
 *   row and is fine; the sign-in signature that follows it fires from an
 *   effect after the page comes back, with no tap in sight, and without a
 *   gate the universal link degrades to loading phantom.app as a web page.
 *   `withTap` pauses such a request until the UI reports a fresh tap.
 * - Stall detection. There is no event for "the app is not installed" — the
 *   navigation just does nothing. The one observable signal is that the tab
 *   never went to the background, so a timer checks exactly that.
 * - Tablets. iPadOS Safari reports a desktop user-agent, so the touch-device
 *   test uses `maxTouchPoints` alongside it.
 */

/* ------------------------------------------------------------------------ */
/* Wallets                                                                  */
/* ------------------------------------------------------------------------ */

/** Universal-link base per wallet. All three speak the same v1 protocol. */
export const DEEPLINK_BASE: Record<string, string> = {
  phantom: "https://phantom.app/ul/v1",
  solflare: "https://solflare.com/ul/v1",
  backpack: "https://backpack.app/ul/v1",
};

const WALLET_NAME: Record<string, string> = {
  phantom: "Phantom",
  solflare: "Solflare",
  backpack: "Backpack",
};

/* ------------------------------------------------------------------------ */
/* Device                                                                   */
/* ------------------------------------------------------------------------ */

/**
 * A phone or tablet browser — the places an extension cannot run.
 *
 * The user-agent check catches phones and older iPads; the `maxTouchPoints`
 * check catches iPadOS, which reports itself as a Macintosh. A real Mac has
 * no touch points, so it stays on the extension path.
 */
export function isTouchDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/* ------------------------------------------------------------------------ */
/* Persistence                                                              */
/* ------------------------------------------------------------------------ */

const STORE_KEY = "underly.deeplink";

export type DeeplinkMethod =
  | "connect"
  | "signMessage"
  | "signTransaction"
  | "signAndSendTransaction";

/** Per-wallet keys and, once connected, the wallet's session. */
interface WalletKeys {
  dappSecret: string;
  dappPublic: string;
  /** Present after a successful connect. */
  shared?: string;
  session?: string;
  publicKey?: string;
}

/**
 * What the app is being asked for right now. Written just before the page
 * navigates to the wallet, read back by `consumeRedirect` when it returns.
 * `tag`/`data` are the caller's own resume context, carried through
 * untouched — a sign-in remembers where it was headed, a trade remembers
 * what to record.
 */
export interface Pending {
  wallet: string;
  method: DeeplinkMethod;
  tag?: string;
  data?: unknown;
  at: number;
}

/**
 * The decrypted answer to the last `Pending`, waiting for whichever flow
 * asked for it to pick it up via `takeResult`.
 */
export interface DeeplinkResult {
  wallet: string;
  method: DeeplinkMethod;
  tag?: string;
  data?: unknown;
  /** The wallet's decrypted JSON payload (`{public_key, session}`, `{signature}`, ...). */
  payload: Record<string, unknown>;
  at: number;
}

interface Store {
  wallets: Record<string, WalletKeys>;
  pending?: Pending;
  result?: DeeplinkResult;
}

function readStore(): Store {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw) as Store;
  } catch {
    /* corrupt or unavailable — start clean */
  }
  return { wallets: {} };
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {
    /* private mode; the round-trip will simply not resume */
  }
}

/* ------------------------------------------------------------------------ */
/* Tap gate                                                                 */
/* ------------------------------------------------------------------------ */

export type ContinueWhat = "connect" | "sign" | "transaction";

let continueGate: ((what: ContinueWhat) => Promise<void>) | null = null;

/**
 * Register the UI that asks for a tap. The callback resolves once the
 * person has tapped, at which point the held request navigates to the app
 * on a fresh activation.
 */
export function onContinueNeeded(fn: ((what: ContinueWhat) => Promise<void>) | null): void {
  continueGate = fn;
}

async function withTap(what: ContinueWhat): Promise<void> {
  const active = navigator.userActivation?.isActive ?? true;
  if (active || !continueGate) return;
  wdebug("tap gate: waiting for a tap before", what);
  await continueGate(what);
  wdebug("tap gate: released", what);
}

/* ------------------------------------------------------------------------ */
/* Errors                                                                   */
/* ------------------------------------------------------------------------ */

export class DeeplinkError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "DeeplinkError";
  }
}

/* ------------------------------------------------------------------------ */
/* Redirect handling                                                        */
/* ------------------------------------------------------------------------ */

/**
 * The query-string names the wallet answers with. The public key is only
 * on a connect response and is prefixed with the wallet's own name
 * (`phantom_encryption_public_key`, `solflare_...`), so it is matched by
 * suffix rather than listed.
 */
function findWalletPublicKey(params: URLSearchParams): string | null {
  for (const [k, v] of params) {
    if (k.endsWith("_encryption_public_key")) return v;
  }
  return null;
}

const RESPONSE_PARAMS = ["nonce", "data", "errorCode", "errorMessage"];

/**
 * Called once per page load, before anything else touches the wallet. If
 * the URL carries a wallet response and a `Pending` matches it, decrypts
 * it, stores the outcome as `result` (or throws away the pending on an
 * error) and strips the response from the URL so a reload cannot replay it.
 *
 * Returns the stored result, or an error string to surface, or null when
 * this load was not a wallet return.
 */
export function consumeRedirect(): { result?: DeeplinkResult; error?: string } | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(location.search);
  const hasResponse = params.has("errorCode") || (params.has("data") && params.has("nonce"));
  if (!hasResponse) return null;

  const store = readStore();
  const pending = store.pending;
  delete store.pending;

  const clean = () => {
    const url = new URL(location.href);
    for (const k of RESPONSE_PARAMS) url.searchParams.delete(k);
    for (const [k] of [...url.searchParams]) {
      if (k.endsWith("_encryption_public_key")) url.searchParams.delete(k);
    }
    history.replaceState(history.state, "", url.toString());
  };

  if (!pending) {
    wdebug("redirect: response with no pending request — ignoring");
    writeStore(store);
    clean();
    return null;
  }

  const name = WALLET_NAME[pending.wallet] ?? pending.wallet;

  if (params.has("errorCode")) {
    const code = params.get("errorCode") ?? "";
    const msg = params.get("errorMessage") ?? "";
    wdebug("redirect: wallet error", pending.method, code, msg);
    writeStore(store);
    clean();
    const error =
      code === "4001" ? `${pending.method === "connect" ? "Connection" : "Request"} declined in ${name}.` : msg || `${name} returned an error (${code}).`;
    return { error };
  }

  const keys = store.wallets[pending.wallet];
  if (!keys) {
    writeStore(store);
    clean();
    return { error: `Lost the ${name} session keys — try again.` };
  }

  try {
    if (pending.method === "connect") {
      const walletPub = findWalletPublicKey(params);
      if (!walletPub) throw new DeeplinkError("connect response has no wallet key");
      const shared = nacl.box.before(bs58.decode(walletPub), bs58.decode(keys.dappSecret));
      keys.shared = bs58.encode(shared);
    }
    if (!keys.shared) throw new DeeplinkError("no shared secret for this wallet");

    const opened = nacl.box.open.after(
      bs58.decode(params.get("data")!),
      bs58.decode(params.get("nonce")!),
      bs58.decode(keys.shared),
    );
    if (!opened) throw new DeeplinkError("could not decrypt the wallet response");
    const payload = JSON.parse(new TextDecoder().decode(opened)) as Record<string, unknown>;

    if (pending.method === "connect") {
      keys.session = String(payload.session ?? "");
      keys.publicKey = String(payload.public_key ?? "");
    }

    const result: DeeplinkResult = {
      wallet: pending.wallet,
      method: pending.method,
      tag: pending.tag,
      data: pending.data,
      payload,
      at: Date.now(),
    };
    store.result = result;
    writeStore(store);
    clean();
    wdebug("redirect: got", pending.method, "from", name, pending.tag ? `(tag ${pending.tag})` : "");
    return { result };
  } catch (e) {
    wdebug("redirect: failed", e);
    writeStore(store);
    clean();
    return { error: e instanceof Error ? e.message : `Could not read the ${name} response.` };
  }
}

/**
 * Hand the stored result to the flow it belongs to. Results are claimed by
 * `tag`, so a sign-in never picks up a trade's signature or vice versa.
 * Claiming removes it; a second call returns null.
 */
export function takeResult(tag: string): DeeplinkResult | null {
  const store = readStore();
  const r = store.result;
  if (!r || r.tag !== tag) return null;
  delete store.result;
  writeStore(store);
  return r;
}

/* ------------------------------------------------------------------------ */
/* Provider                                                                 */
/* ------------------------------------------------------------------------ */

const STALL_MS = 8000;

export interface ResumeContext {
  tag: string;
  data?: unknown;
}

/** Whatever shape a caller hands us for a transaction, reduced to bytes. */
function transactionBytes(tx: unknown): Uint8Array {
  if (tx instanceof Uint8Array) return tx;
  if (typeof tx === "string") {
    const bin = atob(tx);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const t = tx as { serialize?: (opts?: unknown) => Uint8Array };
  if (typeof t?.serialize === "function") {
    // Legacy `Transaction` throws on missing signatures unless told not to;
    // `VersionedTransaction.serialize` takes no options and ignores them.
    return t.serialize({ requireAllSignatures: false, verifySignatures: false });
  }
  throw new DeeplinkError("Unsupported transaction shape.");
}

/**
 * One instance per wallet id. Stateless beyond the store — every field the
 * next page load needs is in `localStorage`, not on `this`.
 */
export class DeeplinkProvider {
  readonly isDeeplink = true as const;

  constructor(readonly walletId: string) {}

  private get name(): string {
    return WALLET_NAME[this.walletId] ?? this.walletId;
  }

  private keys(): WalletKeys | undefined {
    return readStore().wallets[this.walletId];
  }

  /** Matches the injected provider's `publicKey` shape. */
  get publicKey(): { toString(): string } | null {
    const pk = this.keys()?.publicKey;
    return pk ? { toString: () => pk } : null;
  }

  on(): void {
    /* No account-change events over a deeplink. */
  }

  /* ------------------------------------------------------------------ */

  async connect(opts?: { onlyIfTrusted?: boolean }): Promise<{ publicKey: { toString(): string } }> {
    const pk = this.publicKey;
    if (pk) return { publicKey: pk };
    if (opts?.onlyIfTrusted) throw new DeeplinkError("not connected");
    return this.connectVia();
  }

  /**
   * Start a connect round-trip. `resume` is what the caller wants back
   * once the page returns — connect on its own has nothing to resume, but
   * a sign-in that begins with a connect does.
   */
  async connectVia(resume?: ResumeContext): Promise<never> {
    const store = readStore();
    const pair = nacl.box.keyPair();
    // A fresh keypair per connect: the old shared secret belongs to a
    // session the wallet no longer knows about.
    store.wallets[this.walletId] = {
      dappSecret: bs58.encode(pair.secretKey),
      dappPublic: bs58.encode(pair.publicKey),
    };
    writeStore(store);

    const url = new URL(`${DEEPLINK_BASE[this.walletId]}/connect`);
    url.searchParams.set("app_url", location.origin);
    url.searchParams.set("dapp_encryption_public_key", store.wallets[this.walletId].dappPublic);
    url.searchParams.set("redirect_link", redirectLink());
    url.searchParams.set("cluster", process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? "devnet");

    return this.go("connect", url, "connect", resume);
  }

  async disconnect(): Promise<void> {
    // No round-trip: dropping the session locally is what the app would do
    // on our behalf, and one fewer app switch is worth more than the
    // symmetry.
    const store = readStore();
    delete store.wallets[this.walletId];
    writeStore(store);
  }

  async signMessage(message: Uint8Array, _encoding?: string, resume?: ResumeContext): Promise<never> {
    return this.request(
      "signMessage",
      { message: bs58.encode(message), display: "utf8" },
      "sign",
      resume,
    );
  }

  async signTransaction(transaction: unknown, resume?: ResumeContext): Promise<never> {
    return this.request(
      "signTransaction",
      { transaction: bs58.encode(transactionBytes(transaction)) },
      "transaction",
      resume,
    );
  }

  async signAndSendTransaction(transaction: unknown, _options?: unknown, resume?: ResumeContext): Promise<never> {
    return this.request(
      "signAndSendTransaction",
      { transaction: bs58.encode(transactionBytes(transaction)) },
      "transaction",
      resume,
    );
  }

  /* ------------------------------------------------------------------ */

  private async request(
    method: DeeplinkMethod,
    body: Record<string, unknown>,
    what: ContinueWhat,
    resume?: ResumeContext,
  ): Promise<never> {
    const keys = this.keys();
    if (!keys?.shared || !keys.session) {
      throw new DeeplinkError(`${this.name} is not connected on this device.`);
    }
    const nonce = nacl.randomBytes(24);
    const plain = new TextEncoder().encode(JSON.stringify({ ...body, session: keys.session }));
    const boxed = nacl.box.after(plain, nonce, bs58.decode(keys.shared));

    const url = new URL(`${DEEPLINK_BASE[this.walletId]}/${method}`);
    url.searchParams.set("dapp_encryption_public_key", keys.dappPublic);
    url.searchParams.set("nonce", bs58.encode(nonce));
    url.searchParams.set("redirect_link", redirectLink());
    url.searchParams.set("payload", bs58.encode(boxed));

    return this.go(method, url, what, resume);
  }

  /**
   * Leave for the wallet app. Persists the `Pending` first, waits for a tap
   * if the request is not already inside one, then navigates. The returned
   * promise only ever rejects — if the page is still here after
   * `STALL_MS`, the app never opened.
   */
  private go(method: DeeplinkMethod, url: URL, what: ContinueWhat, resume?: ResumeContext): Promise<never> {
    return (async () => {
      await withTap(what);

      const store = readStore();
      store.pending = { wallet: this.walletId, method, tag: resume?.tag, data: resume?.data, at: Date.now() };
      delete store.result;
      writeStore(store);

      wdebug("deeplink →", this.name, method, resume?.tag ? `(tag ${resume.tag})` : "");

      return new Promise<never>((_, reject) => {
        let left = false;
        const onHide = () => {
          if (document.visibilityState === "hidden") left = true;
        };
        document.addEventListener("visibilitychange", onHide);
        window.addEventListener("pagehide", () => (left = true), { once: true });

        setTimeout(() => {
          document.removeEventListener("visibilitychange", onHide);
          if (left) return;
          wdebug("stall: page never left — app not installed?");
          const s = readStore();
          if (s.pending?.at === store.pending?.at) {
            delete s.pending;
            writeStore(s);
          }
          reject(
            new DeeplinkError(
              `${this.name} did not open — install the ${this.name} app, then try again.`,
              "stall",
            ),
          );
        }, STALL_MS);

        location.href = url.toString();
      });
    })();
  }
}

/** This page, minus any stale wallet response still in its URL. */
function redirectLink(): string {
  const url = new URL(location.href);
  for (const k of RESPONSE_PARAMS) url.searchParams.delete(k);
  for (const [k] of [...url.searchParams]) {
    if (k.endsWith("_encryption_public_key")) url.searchParams.delete(k);
  }
  url.hash = "";
  return url.toString();
}

export function isDeeplinkProvider(p: unknown): p is DeeplinkProvider {
  return p instanceof DeeplinkProvider;
}

/** Signature bytes from a `signMessage` payload. */
export function signatureBytes(payload: Record<string, unknown>): Uint8Array {
  return bs58.decode(String(payload.signature ?? ""));
}
