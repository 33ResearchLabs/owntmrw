import type { Metadata } from "next";
import Link from "next/link";
import { FaqAccordion, type FaqItem } from "@/components/FaqAccordion";

/*
 * Public, like the home, project and legal pages — `proxy.ts` gates only the
 * four signed-in areas. Nothing here touches the session.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "FAQ — Underly",
  description: "Answers to common questions about Underly.",
};

/*
 * Supplied copy, held verbatim.
 *
 * Nothing in this file is authored: the wording, punctuation, capitalisation
 * and order are exactly as provided. The only decisions made here are which
 * lines are questions, which are paragraphs and which are list items — that is,
 * how the text is laid out, not what it says.
 *
 * The one departure is the emphasis markers around the dimension names in
 * "What are the different intelligence dimensions?": the accordion renders its
 * strings as text, so a literal `**Treasury**` would print its asterisks. The
 * words are unchanged.
 *
 * Any change to these answers should come from their owner as new copy, not be
 * made in place here.
 */

/** The document's own heading, carried as the line under the page title. */
const SUBTITLE = "Frequently Asked Questions";

const ITEMS: FaqItem[] = [
  {
    q: "What is Underly?",
    a: [
      "Underly is an intelligence terminal for projects launched through MetaDAO and Futard. Instead of another price explorer, it maintains one permanent research profile per project — covering the raise, market, holders, treasury, governance, development, community and news — assembled automatically from public sources. The goal is simple: understand what a project actually is, not just what its token did today.",
    ],
  },
  {
    q: "What does Underly provide?",
    a: [
      "Underly brings institutional-grade research into a single workspace. For each tracked project you get:",
      [
        "A full intelligence profile with Overview, Holders, Smart Money, Treasury, Development, Governance, Timeline, News and Research tabs",
        "A composite Project Health Score across seven measurable dimensions",
        "Price history charts with event markers (raise closed, launch, proposals, releases)",
        "A screener for sorting and filtering the entire ecosystem",
        "A chronological ecosystem-wide event timeline",
        "An automatically generated signals feed",
        "Global search across projects, tokens, wallets and proposals",
      ],
    ],
  },
  {
    q: "What can users analyze?",
    a: [
      "You can analyze every tracked project across:",
      [
        "Fundraising and raise performance (committed vs. accepted, raise price, ROI since raise)",
        "Treasury health, balance history and runway against the amount raised",
        "Holder counts, distribution and top-wallet concentration",
        "Liquidity depth, market cap, FDV, volume and price history",
        "Developer activity across public repositories",
        "Governance activity",
        "Contract risk checks and exchange listings",
        "News, announcements and repository releases",
      ],
    ],
  },
  {
    q: "How does the platform work?",
    a: [
      "An ingestion pipeline pulls data from public sources on a schedule and writes it into a permanent local archive. Each run appends a new snapshot — nothing is overwritten or deleted — so holder counts, treasury balances, prices and development activity build up into real history over time. The site then reads that archive and presents it as profiles, scores, charts and signals. Live market prices are fetched at request time and merged over the stored snapshot, so quotes are current even between ingest runs.",
    ],
  },
  {
    q: "Where does the data come from?",
    a: [
      "Public sources only, with no proprietary or paywalled feeds:",
      [
        "MetaDAO launchpad and on-chain records — project registry, raises, DAOs",
        "Solana RPC — token supply, holder accounts, wallet resolution",
        "DexScreener and Jupiter — live price, market cap, FDV, liquidity, volume",
        "GeckoTerminal — daily OHLCV price history and holder counts",
        "GitHub — repositories, commits, contributors, releases, issues, languages",
        "CoinGecko — exchange listings and token metadata",
        "RugCheck — automated contract risk checks",
        "Publisher RSS feeds — news coverage",
      ],
      "Every metric traces back to a public source that can be independently verified.",
    ],
  },
  {
    q: "How often is the data updated?",
    a: [
      "Market data — price, market cap, liquidity, volume and 24-hour change — is fetched live at request time, so what you see is current to within seconds. Archival data such as holder snapshots, treasury balances, development activity, governance and news refreshes each time the ingestion pipeline runs, and every project page carries a “last updated” stamp so you always know how fresh the underlying reading is.",
    ],
  },
  {
    q: "What is the Project Health Score?",
    a: [
      "The Project Health Score is a single 0–100 composite that summarises how a project is performing across the dimensions public data can actually verify. It is shown as a dial with a plain-language verdict — Strong, Moderate, Needs Attention or Critical — alongside a breakdown of every dimension that produced it. It is a research summary, not a rating, recommendation or price target.",
    ],
  },
  {
    q: "How is the Health Score calculated?",
    a: [
      "Each of seven dimensions is scored 0–100 from measured data, and the overall score is the average of the dimensions that could be measured. Two rules keep it honest:",
      [
        "A dimension with no data available is excluded from the average rather than scored as zero — an unmeasured dimension is not a failing one.",
        "Every project page shows how many of the seven dimensions were measurable, and each dimension displays the exact figure behind its score (for example “top 10 hold 61.4% of supply” or “last push 3d ago”).",
      ],
      "There is no black box: the number is always reproducible from the data shown beside it.",
    ],
  },
  {
    q: "What are the different intelligence dimensions?",
    a: [
      "The Health Score is built from seven dimensions:",
      [
        "Treasury — how much of the raised capital is still held on-chain",
        "Holder Growth — the trend in holder count across tracked snapshots",
        "Distribution — how concentrated ownership is, based on top-10 supply share",
        "Liquidity — pool depth relative to market cap",
        "Developer Activity — recency of public code activity",
        "Governance — indexed proposal throughput",
        "Momentum — 30-day price trend blended with volume-to-liquidity turnover",
      ],
      "Project pages go further, adding contract risk, supply allocation, exchange listings, smart-money flow, news and an AI-assembled research memo.",
    ],
  },
  {
    q: "Can users compare projects?",
    a: [
      "Yes. The screener puts every tracked project into one sortable, filterable table — price, 24-hour change, market cap, liquidity, 24-hour volume, amount raised, raise price, ROI vs. raise, ATH return, distance from ATH, treasury, holder count, GitHub stars and last commit. Health Scores are calculated for every project on the same basis, so they can be ranked directly, and each project page includes a “Performance Since Raise” view tracking ROI, treasury, holders and market cap from day one.",
    ],
  },
  {
    q: "What information is available about holders and treasury?",
    a: [
      "The Holders tab shows total holder count, how that count has moved over the tracked window, concentration figures such as the share of supply held by the top wallets, the largest individual wallets with labels where they can be identified, and how supply is allocated between treasury, pools and circulation. Wallets link through to their own pages.",
      "The Treasury tab shows the on-chain vault balance and pool depth, the treasury measured against both the amount raised and the current market cap, and a full history of recorded balance changes so runway can be tracked over time.",
    ],
  },
  {
    q: "How does development activity tracking work?",
    a: [
      "Where a project has a public GitHub organisation, Underly reads it directly and reports commits over the last 90 days, unique contributors, tagged releases, stars, forks, open and closed issues, pull requests, active repositories, last commit time, language breakdown and week-by-week code frequency. These roll up into a Developer Score covering recency, commit volume, contributors, active repositories and issue hygiene. Where no public repository is linked, the platform says so plainly rather than showing an empty or invented figure.",
    ],
  },
  {
    q: "What is the role of AI insights?",
    a: [
      "AI insights turn measured data into readable analysis. The Research tab assembles a memo for each project — summary, bull case, bear case, strengths, weaknesses, risks, recent developments, momentum and outlook — where every point cites the number behind it. Points with no supporting data are omitted rather than filled with generic commentary. Alongside this, the Signals feed automatically surfaces observations such as holder shifts, volume changes, concentration moves and development spikes. Insights are informational and never predictive.",
    ],
  },
  {
    q: "Can users track or save projects?",
    a: [
      "Yes. Every project has a permanent profile at a stable URL, so research is always where you left it and history accumulates rather than resetting. The Timeline feed follows ecosystem-wide events chronologically, the Signals feed surfaces new observations as they are generated, and connecting a wallet gives you a Portfolio view of your holdings across every token the terminal tracks.",
    ],
  },
  {
    q: "Is a wallet required?",
    a: [
      "Not for research. Project profiles, the timeline, the signals feed and global search are open to everyone with no account and no wallet. A wallet is needed for the signed-in areas — the screener and your portfolio. Sign-in works by signing a short message that proves you control the wallet; it approves no transaction and cannot move funds. Underly never asks for a private key, seed phrase or recovery phrase, and portfolio balances are read from the chain in your browser rather than stored on a server.",
    ],
  },
  {
    q: "Can users trade through Underly?",
    a: [
      "Underly is research-first and fully non-custodial. The trade panel lets you size an order against live market data and shows the quantities, slippage setting and the share of pool depth an order of that size would consume — real risk context before you act. Where trading functionality is available, it is wallet-based: your assets stay under your own wallet's control and Underly never takes custody of funds or holds tokens on your behalf.",
    ],
  },
  {
    q: "Is Underly an investment advisor?",
    a: [
      "No. Underly provides research, analytics and market data. Nothing on the platform is financial, investment, legal or tax advice, and no score, signal or memo is a recommendation to buy or sell. Digital assets are volatile and can lose value. All decisions, and their outcomes, are your own.",
    ],
  },
  {
    q: "How does Underly handle data transparency?",
    a: [
      "Transparency is enforced in the product, not just promised:",
      [
        "Market cap is calculated from circulating supply and FDV from total supply, rather than repeating a venue's figure that conflates the two.",
        "Raise figures are read from on-chain launch records with a citation per project, and the amount committed is always distinguished from the amount actually accepted.",
        "Return metrics are withheld when a token's liquidity is too thin for its quoted price to be meaningful, and the page explains why.",
        "Unmeasurable dimensions are excluded from the Health Score rather than counted as zero.",
        "Where data is genuinely unavailable, the page says so — no dimension is ever filled with an estimate presented as fact.",
      ],
    ],
  },
  {
    q: "Who is Underly designed for?",
    a: [
      "Underly is built for anyone who needs to understand a project rather than just watch its price: researchers and analysts, allocators evaluating launches, founders and teams benchmarking themselves against the ecosystem, and participants tracking MetaDAO and Futard projects from raise through to today. If you want verifiable, source-linked intelligence in one place instead of a dozen tabs, the terminal is built for you.",
    ],
  },
];

export default function FaqPage() {
  return (
    /*
     * One column, centred and capped. The measure is what drives the width:
     * a question stranded against a chevron half a screen away stops reading
     * as one row, and `main` runs to 1660px.
     */
    <div className="mx-auto max-w-[820px] pb-6">
      {/* ---- breadcrumb ---- */}
      <nav aria-label="Breadcrumb" className="text-[12.5px] text-muted">
        <ol className="flex items-center gap-2">
          <li>
            <Link href="/" className="transition-colors duration-150 hover:text-ink">
              Home
            </Link>
          </li>
          <li aria-hidden className="text-faint">
            ›
          </li>
          {/* The current page is not a link — `aria-current` marks it instead,
              so it is announced as where the reader already is. */}
          <li aria-current="page" className="text-ink2">
            FAQ
          </li>
        </ol>
      </nav>

      {/* ---- heading ---- */}
      <div className="mt-10 text-center sm:mt-12">
        {/* Responsive from the first step rather than a fixed display size —
            the home page's fixed 64px hero is what overflows a phone. */}
        <h1 className="text-[48px] font-extrabold leading-none tracking-[-0.04em] sm:text-[60px] lg:text-[68px]">
          FAQ
        </h1>
        <p className="mx-auto mt-5 max-w-[520px] text-[14px] leading-relaxed text-ink2 sm:text-[15px]">
          {SUBTITLE}
        </p>
      </div>

      {/* ---- accordion ---- */}
      <div className="mt-10 sm:mt-12">
        <FaqAccordion items={ITEMS} />
      </div>
    </div>
  );
}
