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
            stays — it is the gap below the bar, not between the bars. */}
        <header className="sticky top-0 z-50 bg-page pb-3">
          <div className="nav-glass mx-auto flex h-16 max-w-[1660px] items-center gap-3 px-3 sm:px-4 lg:gap-5 lg:px-12">
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
          <main className="min-w-0 flex-1 px-6 py-7">{children}</main>
        </div>

        {/* The disclaimer and the legal links share one row from `sm` and stack
            below it — the links sit beside the paragraph rather than under it,
            so the footer keeps its single-band height on a desktop. Type scale,
            colour and the band's own padding are unchanged. */}
        <footer className="border-t border-line py-5">
          <div className="flex flex-col justify-between gap-3 px-16 text-[11.5px] leading-relaxed text-faint sm:flex-row sm:items-start sm:gap-10">
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
