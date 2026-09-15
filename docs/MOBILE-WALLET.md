# Phone & tablet wallet connection (Phantom deeplinks)

How `src/lib/walletDeeplink.ts` connects a phone or tablet browser to Phantom,
Solflare or Backpack, why it's built the way it is, and where to look when it
breaks.

## The problem this replaces

Phones and tablets can't run a wallet browser extension, so nothing ever injects
`window.phantom` there. The old `wallet.tsx` only knew about injected providers:
on a phone every row in the sign-in dialog read **"Not installed"** and tapping
one opened phantom.com — even for someone with the Phantom app on the same
device. There was no way to connect at all outside the wallet's own in-app
browser.

## The fix

Phantom, Solflare and Backpack all implement the same universal-link protocol
(Phantom calls it *deeplinks*): the site makes an X25519 keypair, sends the app an
encrypted request as `https://<wallet>/ul/v1/<method>?...`, the app shows its
approval screen, then opens `redirect_link` — our page — with the encrypted
answer in the query string. `tweetnacl` and `bs58` were already dependencies, so
this adds no packages.

Unlike MetaMask Connect on the EVM side, there is no relay socket here — Solana
wallets have no equivalent. **The answer arrives as a page load.** That is the
one design constraint everything below follows: every request persists enough
state to `localStorage` that a fresh page, with no React state at all, can pick
up where it left off.

## Three code paths, one API

`wallet.tsx` exposes one API (`connect`, `login`, `signAndSendTransaction`, ...)
that resolves to one of three underlying providers depending on where the page
is running:

| Where                               | How the provider is obtained                        |
|--------------------------------------|-----------------------------------------------------|
| Desktop                              | `window.phantom.solana` etc. — the extension injects it |
| The wallet's own in-app browser      | the same injected object — the app injects it too   |
| Any other phone or tablet browser    | `DeeplinkProvider`, built lazily per wallet         |

```ts
// wallet.tsx
function providerFor(id: string): InjectedProvider | null {
  const injected = WALLETS.find((w) => w.id === id)?.detect();
  if (injected) return injected;
  return deeplinkFor(id);          // only on a touch device, only for known wallets
}
```

`DeeplinkProvider` implements the same shape as an injected provider
(`publicKey`, `connect`, `disconnect`, `signMessage`, `signTransaction`,
`signAndSendTransaction`), so `login`, the trade terminal and the invest modal
call it without knowing which one they got. The one visible difference: a call
that has to visit the app **never resolves** — the page is leaving — and the
flow resumes from the persisted record on the next load.

`isTouchDevice()` is the switch. It checks the user-agent for phones and older
iPads, and `navigator.maxTouchPoints > 1` alongside a `Macintosh` UA for iPadOS,
which reports itself as a desktop Mac.

## The round-trip

```
tap "Phantom" row
  └─ login()  ──►  p.connectVia({ tag: "login", data: { next } })
                     writes  { pending: { wallet, method: "connect", tag, data } }
                     location.href = https://phantom.app/ul/v1/connect?…
                                       ↓ Phantom approval screen
                     Phantom opens redirect_link?phantom_encryption_public_key=…&nonce=…&data=…
page loads
  └─ consumeRedirect()   derives shared secret, decrypts {public_key, session},
                         stores them for the wallet, strips the params from the URL
  └─ resumeLogin()       POST /api/auth/nonce  ──►  p.signMessage(…, { tag: "login", data: { next, address, nonce } })
                         (through the tap gate — see below)
                         location.href = https://phantom.app/ul/v1/signMessage?…
                                       ↓ Phantom sign screen
page loads
  └─ consumeRedirect()   decrypts {signature}
  └─ resumeLogin()       POST /api/auth/verify  ──►  session cookie  ──►  router.push(next) / refresh()
```

The persisted record is one JSON blob under `localStorage["underly.deeplink"]`:

```ts
{
  wallets: { phantom: { dappSecret, dappPublic, shared?, session?, publicKey? } },
  pending?: { wallet, method, tag?, data?, at },   // written just before leaving
  result?:  { wallet, method, tag?, data?, payload, at },  // written by consumeRedirect
}
```

`tag`/`data` are the caller's own resume context and pass through untouched. A
sign-in remembers `next`; a trade remembers `{ tokenMint, amountUsdt, priceUsd }`.
Results are claimed by tag (`takeDeeplinkResult("trade")`), so a sign-in can never
pick up a trade's signature or vice versa, and a claim removes the result so a
reload can't replay it.

## Resuming after the page comes back

Each flow that leaves for the app has a mount-time resume:

- **Sign-in** — `wallet.tsx`'s detect effect runs `consumeRedirect()` first, and
  if the result is tagged `login`, hands it to `resumeLogin`. After `connect` it
  asks for the signature; after `signMessage` it verifies and navigates.
- **Trade terminal** — `TradeTerminal` calls
  `signAndSendTransaction(tx, { tag: "trade", data: { tokenMint, amountUsdt, priceUsd } })`
  and, on mount, `takeDeeplinkResult("trade")`. The post-signature bookkeeping
  (receipt, `/api/swap/confirm`, ledger refresh, `wallet-transaction` event) was
  pulled into `recordBuy()` so both paths run the same code. It is guarded on
  the mint, so a project page never records a trade started on a different one.
- **Invest modal** — `TokenInvestment` claims `"invest"` on mount and reopens
  `InvestModal` straight into its receipt via `resumedSignature`.

`redirect_link` is always the current page (minus any stale wallet params), so
the component that started the flow is the one mounted when it returns.

## The tap gate (the tricky part)

Safari and Chrome only let a page open another app inside a few seconds of a real
tap ("transient activation"). Connect fires from the tap on the wallet row and is
fine. But the sign-in signature that follows it fires from an effect *after the
page has reloaded*, with no tap anywhere near it — and without a gate the
universal link silently degrades: Safari loads phantom.app as a web page instead
of opening the app, and the reader is stranded on a download page.

Fix: every navigation to the app goes through `withTap`, which checks
`navigator.userActivation.isActive` and, if nothing is live, pauses until the UI
reports a tap:

```ts
// walletDeeplink.ts
async function withTap(what) {
  const active = navigator.userActivation?.isActive ?? true;
  if (active || !continueGate) return;
  await continueGate(what);   // resolves when the reader taps
}
```

The UI half is `ContinueToast` (mounted once in `SignInProvider`) plus the header
chip: `WalletProvider` registers the gate with `onContinueNeeded`, exposes it as
`w.continueNeeded = { what, resume }`, and both the toast and `ConnectButton`
(which reads **"Tap to continue"** instead of "Check your wallet…") call
`resume()` on tap. That re-fires `location.href` inside a fresh activation, so the
app comes to the front with its prompt.

## Detecting "the app isn't installed"

There is no error for it — the `https://phantom.app/ul/...` navigation either
opens the app or does nothing (or, on iOS, loads phantom.app's site). The only
observable signal is that the tab never went to the background, so `go()` starts
an 8-second timer and rejects with *"Phantom did not open — install the Phantom
app, then try again."* if neither `visibilitychange → hidden` nor `pagehide`
fired. The error surfaces in the sign-in dialog (as `login`'s return value) or
in the notice toast (from `connect`/resume).

## Declines and failures

The app answers a decline with `?errorCode=4001&errorMessage=…` on the same
`redirect_link`. `consumeRedirect` turns that into `w.notice` ("Connection
declined in Phantom."), which `ContinueToast` shows — the reader has just landed
on a reloaded page with no dialog open, so without this the decline would be
silent. A failed verify after coming back lands in the same place.

## Infra

No CSP is set in `next.config.ts`, so nothing was needed there. The wallet
calls are top-level navigations, not fetches; if a CSP is ever added, they need
nothing from `connect-src` — but the page must remain reachable at the exact
`redirect_link` it sent, so don't strip unknown query params on the way in.

The `cluster` sent to the app is `NEXT_PUBLIC_SOLANA_CLUSTER` (default
`devnet`), and must match what `/api/swap` builds transactions for.

## Debug tooling

`?walletdebug=1` on the URL (remembered as `localStorage["underly.walletDebug"]`;
`?walletdebug=0` clears it) turns on an on-page log strip at the bottom of the
screen — every deeplink built, every redirect consumed, tap-gate waits and
releases, stalls — since a phone has no attached devtools and the page reloads
between steps, so `console.log` is gone by the time anyone could read it. The
logger is `wdebug()` in `src/lib/walletDebug.ts`.

## Files touched

- `src/lib/walletDeeplink.ts` — the protocol client: keys, encryption,
  persistence, `consumeRedirect`, `takeResult`, tap gate, stall timer.
- `src/lib/walletDebug.ts` — the on-page log strip.
- `src/components/wallet.tsx` — three-way `providerFor`, `appWallets`,
  `continueNeeded`/`notice`, resumable `login`, `takeDeeplinkResult`,
  `signAndSendTransaction(tx, resume)`.
- `src/components/ContinueToast.tsx` — the tap-gate prompt and notice toast.
- `src/components/SignInProvider.tsx` — mounts the toast.
- `src/components/ConnectButton.tsx` — chip mirrors the gate.
- `src/components/SignInContent.tsx`, `WalletModal.tsx`, `LoginPanel.tsx` —
  "Opens the Phantom app" labels; `next` carried into `login`.
- `src/components/TradeTerminal.tsx` — `recordBuy()` shared by both paths;
  resume on mount.
- `src/components/InvestModal.tsx`, `TokenInvestment.tsx` — resume into the
  receipt.

## What's verified, and what isn't

Verified with a simulated wallet (its own keypair, shared secret, encrypted
replies): the connect handshake, `signMessage` request encoding and response
decryption, tag-scoped result claiming, URL cleanup and replay protection,
silent reconnect from the stored session, the decline path, the tap gate and
the stall timer. `next build` and `tsc` pass.

Not yet verified on a real device: that iOS Safari and Android Chrome open the
app from `location.href` on each step (the tap gate exists for exactly this),
whether the return lands in the same tab or a new one (both work — state is in
`localStorage`, not the tab), Solflare's and Backpack's response parameter
names (matched by the `_encryption_public_key` suffix rather than assumed), and
the trade round-trip end to end. If a device test surfaces a new failure mode,
start with `?walletdebug=1`.
