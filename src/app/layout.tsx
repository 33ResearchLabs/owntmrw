import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import { GlobalSearch } from "@/components/GlobalSearch";
import { SideRail } from "@/components/SideRail";
import { WalletProvider } from "@/components/wallet";
import { ConnectButton } from "@/components/ConnectButton";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "OwnTmrw — Own Tomorrow | MetaDAO Intelligence Terminal",
  description:
    "Institutional-grade intelligence for every project launched on MetaDAO and Futard: raises, markets, holders, treasuries, governance, development and community — in one place.",
};

const NAV = [
  { href: "/", label: "Home" },
  { href: "/screener", label: "Screener" },
  { href: "/timeline", label: "Activity" },
  { href: "/observations", label: "Signals" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <WalletProvider>
        <header className="sticky top-0 z-50 border-b border-line bg-page/85 backdrop-blur-xl">
          <div className="mx-auto flex h-14 max-w-[1660px] items-center gap-6 px-6">
            <Link href="/" className="flex shrink-0 items-baseline gap-2.5" aria-label="OwnTmrw — Own Tomorrow">
              <span
                className="flex h-[30px] w-[30px] shrink-0 translate-y-[3px] items-center justify-center rounded-full text-[15px] font-extrabold text-white"
                style={{ background: "radial-gradient(circle at 35% 35%, #86b6ef, #3987e5 55%, #184f95)" }}
              >
                ∞
              </span>
              <span className="text-[13.5px] font-extrabold tracking-[0.07em]">
                OWNTMRW
              </span>
              <span className="hidden text-[10.5px] uppercase tracking-[0.13em] text-faint lg:inline">
                Own Tomorrow
              </span>
            </Link>

            <nav className="hidden items-center gap-1 sm:flex">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-ink2 transition-colors hover:bg-white/6 hover:text-ink"
                >
                  {n.label}
                </Link>
              ))}
            </nav>

            <div className="mx-auto w-full max-w-[460px]">
              <GlobalSearch />
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <ConnectButton />
            </div>
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[1660px] flex-1">
          <SideRail />
          <main className="min-w-0 flex-1 px-6 py-7">{children}</main>
        </div>

        <footer className="border-t border-line py-5">
          <div className="mx-auto max-w-[1660px] px-6 text-[11.5px] leading-relaxed text-faint">
            OwnTmrw — public-source intelligence for MetaDAO &amp; Futard projects. Data from
            Solana RPC, MetaDAO market API, DexScreener, GeckoTerminal, Jupiter and GitHub.
            Figures are indexed from public sources and may lag. Not financial advice.
          </div>
        </footer>
        </WalletProvider>
      </body>
    </html>
  );
}
