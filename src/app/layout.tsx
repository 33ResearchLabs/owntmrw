import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import { cookies } from "next/headers";
import { SESSION_COOKIE, sessionAddress } from "@/lib/auth";
import "./globals.css";
import { Mark } from "@/components/ui";
import { GlobalSearch } from "@/components/GlobalSearch";
import { SideRail } from "@/components/SideRail";
import { WalletProvider } from "@/components/wallet";
import { ConnectButton } from "@/components/ConnectButton";
import { SignInProvider } from "@/components/SignInProvider";
import { TopNav } from "@/components/TopNav";
import { AnnouncementBar } from "@/components/AnnouncementBar";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Underly — Own Tomorrow | MetaDAO Intelligence Terminal",
  description:
    "Institutional-grade intelligence for every project launched on MetaDAO and Futard: raises, markets, holders, treasuries, governance, development and community — in one place.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/screener", label: "Screener" },
  { href: "/timeline", label: "Activity" },
  { href: "/observations", label: "Signals" },
  { href: "/portfolio", label: "Portfolio" },
];

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Read here rather than letting the client discover it: the nav decides what
  // to render from this, so it has to be true on the first paint. Every page in
  // the app is already `force-dynamic`, so reading the cookie costs no static
  // rendering.
  const session = sessionAddress((await cookies()).get(SESSION_COOKIE)?.value);

  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WalletProvider initialSession={session}>
        <SignInProvider>
        <AnnouncementBar />
        {/* Opaque, not just the bar: the padding around the bar is a gap the
            page scrolls through, so a transparent wrapper leaks content above
            and beside the floating pill even when the pill itself is solid.
            This element's total height (pt + bar + pb) is what `--nav-h` states.

            No `pt`: that 12px was page colour showing between the announcement
            bar and the nav, and the two now meet on a single edge. The `pb`
            stays — it is the gap below the bar, not between the bars.

            The bar, `<main>` and the footer below share a container — same
            `mx-auto`, same `max-w` — so matching their horizontal padding is
            what makes the logo line up with the first card and the account
            button with the last. All three are `px-6 md:px-12`; changing one
            without the others pulls them apart.

            That was true before too, but had drifted: this bar had been at
            `px-3 sm:px-4 lg:px-12`, on a schedule of its own that never
            matched `<main>`'s flat `px-6` at any width — and the footer's
            wrapper had lost its `mx-auto max-w-[1660px]` entirely, so past
            1660px it ran to the viewport edge while the header and body
            stayed capped and centred. Both are corrected here alongside the
            doubling, since it is the same alignment this comment already
            describes.

            The doubled `px-12` waits for `md` rather than starting at `sm`.
            The bar's search field is the one item here that can shrink, and
            at `sm` two other things land on it at the same moment padding
            would: `TopNav` and the vertical divider both go from hidden to
            shown there too. Three changes on one instant leaves the field
            58px wide, and the auto-margin trick that holds the account
            button to the right edge runs out of free space to consume, so
            the button stops tracking the edge at all. `md` is where padding
            is the only thing still changing, and there is already slack —
            the field sits at 186px there, not 58. Below `sm`, `px-6` is the
            widest padding the bar can take without the same squeeze on its
            own — measured clean at 1920/1600/1024/768/767/640/600/390. */}
        <header className="sticky top-0 z-50 bg-page pb-3">
          <div className="nav-glass mx-auto flex h-16 max-w-[1660px] items-center gap-3 px-6 md:px-12 lg:gap-5">
            <Link href="/" className="flex shrink-0 items-center gap-3" aria-label="Underly — Own Tomorrow">
              <Mark size={36} className="shrink-0" />
              {/* The wordmark carries the rule under it that the logo does —
                  left-aligned and about a third of the word's width, as drawn.
                  `aria-hidden` because it is the mark's shape, not a divider,
                  and the link already names itself. */}
              <span className="flex flex-col items-start">
                <span className="text-[15px] font-extrabold leading-none tracking-[-0.01em]">
                  Underly
                </span>
                <span className="mt-[5px] h-[3px] w-5 rounded-full bg-brand" aria-hidden />
              </span>
            </Link>

            <span className="hidden h-6 w-px shrink-0 bg-line2 sm:block" aria-hidden />

            <TopNav items={NAV} />

            <div className="mx-auto w-full max-w-[340px]">
              <GlobalSearch />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1660px] flex-1">
          {/* <SideRail /> */}
          <main className="min-w-0 flex-1 px-6 py-7 md:px-12">{children}</main>
        </div>

        {/* The disclaimer and the legal links share one row from `sm` and stack
            below it — the links sit beside the paragraph rather than under it,
            so the footer keeps its single-band height on a desktop. Type scale,
            colour and the band's own padding are unchanged. */}
        <footer className="border-t border-line py-5">
          {/* `mx-auto max-w-[1660px]` restored: without it this band ran to the
              viewport edge past 1660px while the header and `<main>` above it
              stayed capped and centred on the same value — the one wrapper
              that had drifted from the invariant the rest of the page keeps. */}
          <div className="mx-auto flex max-w-[1660px] flex-col justify-between gap-3 px-6 text-[11.5px] leading-relaxed text-faint sm:flex-row sm:items-start sm:gap-10 md:px-12">
            <div className="min-w-0">
              © 2026 Underly. All rights reserved.
            </div>

            <nav aria-label="Legal" className="flex shrink-0 items-center gap-4">
              <Link
                href="/terms"
                className="transition-colors duration-150 hover:text-ink2"
              >
                Terms of Use
              </Link>

              <Link
                href="/privacy"
                className="transition-colors duration-150 hover:text-ink2"
              >
                Privacy Policy
              </Link>
            </nav>
          </div>
        </footer>
        </SignInProvider>
        </WalletProvider>
      </body>
    </html>
  );
}
