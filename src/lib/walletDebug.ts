/**
 * On-page log strip for the phone wallet path.
 *
 * A phone has no attached devtools console, and the wallet round-trip
 * navigates the page away and back — so `console.log` is gone by the time
 * anyone could read it. Turn this on with `?walletdebug=1` on the URL (it is
 * remembered in `localStorage` as `underly.walletDebug`), and every provider
 * call, deeplink, stall and tap-gate event is printed at the bottom of the
 * screen instead.
 */

const KEY = "underly.walletDebug";

let enabled: boolean | null = null;
let strip: HTMLElement | null = null;

export function walletDebugEnabled(): boolean {
  if (enabled != null) return enabled;
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(location.search).get("walletdebug");
    if (q === "1") localStorage.setItem(KEY, "1");
    if (q === "0") localStorage.removeItem(KEY);
    enabled = localStorage.getItem(KEY) === "1";
  } catch {
    enabled = false;
  }
  return enabled;
}

function ensureStrip(): HTMLElement {
  if (strip) return strip;
  const el = document.createElement("pre");
  el.id = "wallet-debug";
  el.style.cssText =
    "position:fixed;left:0;right:0;bottom:0;z-index:9999;max-height:38vh;overflow:auto;" +
    "margin:0;padding:6px 8px;font:10.5px/1.4 ui-monospace,Menlo,monospace;" +
    "white-space:pre-wrap;word-break:break-all;color:#d7e3f4;background:rgba(6,10,18,0.92);" +
    "border-top:1px solid rgba(255,255,255,0.15)";
  document.body.appendChild(el);
  strip = el;
  return el;
}

/** Log a line to the console and, when enabled, to the on-page strip. */
export function wdebug(...args: unknown[]): void {
  console.log("[WALLET]", ...args);
  if (!walletDebugEnabled()) return;
  const line = args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return `${a.name}: ${a.message}`;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
  const el = ensureStrip();
  el.textContent += `${new Date().toISOString().slice(11, 19)} ${line}\n`;
  el.scrollTop = el.scrollHeight;
}
