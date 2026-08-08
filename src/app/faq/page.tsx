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
 * The bracketed address in the last entry is the document's own, reproduced as
 * written. "Privacy Policy" and "Terms of Use" in the legal entry are left as
 * plain text rather than linked, because turning copy into a link is a change
 * to the copy.
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
      "Underly is a platform built to help you discover, research, and trade the next generation of technology-driven assets.",
      "We bring deep company and token research, market data, insights, and trading into one place.",
    ],
  },
  {
    q: "What does Underly help me discover?",
    a: [
      "Underly focuses on emerging companies, technologies, protocols, and digital assets that could shape the future.",
      "Our goal is to help you understand what is being built, why it matters, and how the market is valuing it.",
    ],
  },
  {
    q: "What can I do on Underly?",
    a: [
      "With Underly, you can:",
      [
        "Discover emerging technology companies and projects",
        "Research their technology and ecosystem",
        "Explore token fundamentals and tokenomics",
        "Analyze market data",
        "Understand project activity and development",
        "Compare opportunities",
        "Connect your wallet",
        "Buy and sell supported tokens",
      ],
    ],
  },
  {
    q: "Do I need to create an account?",
    a: [
      "No.",
      "Underly is designed around wallet-based access. You can explore and research the platform without creating a traditional account.",
      "Connect your wallet when you want to access supported trading functionality.",
    ],
  },
  {
    q: "Why do I need to connect my wallet?",
    a: [
      "Your wallet allows Underly to interact with supported blockchain functionality and lets you approve transactions.",
      "Your wallet remains under your control at all times.",
      "Underly never asks for your private key, seed phrase, or recovery phrase.",
    ],
  },
  {
    q: "Can Underly access my funds?",
    a: [
      "No.",
      "Underly does not have access to your private keys or recovery phrase.",
      "Transactions require approval through your connected wallet.",
      "Always review the transaction details in your wallet before signing.",
    ],
  },
  {
    q: "What assets can I trade?",
    a: ["Underly focuses on technology-driven digital assets."],
  },
  {
    q: "Does Underly list every token?",
    a: [
      "No.",
      "Underly is designed to focus on selected technology-driven assets rather than attempting to list every token available in the market.",
      "Assets may be evaluated based on factors such as technology, ecosystem, activity, liquidity, market data, security considerations, and availability of reliable information.",
    ],
  },
  {
    q: "Does being listed on Underly mean you recommend the asset?",
    a: [
      "No.",
      "A listing does not represent an endorsement, recommendation, or guarantee from Underly.",
      "Underly provides information and research to help users make their own decisions.",
    ],
  },
  {
    q: "What information does Underly provide?",
    a: [
      "Depending on the asset, Underly may provide:",
      [
        "Company or project overview",
        "Technology overview",
        "Product information",
        "Token utility",
        "Tokenomics",
        "Supply information",
        "Market capitalization",
        "Trading volume",
        "Price history",
        "Liquidity",
        "Ecosystem information",
        "Development activity",
        "Market insights",
        "Risk information",
        "Other relevant research",
      ],
    ],
  },
  {
    q: "What makes Underly different?",
    a: [
      "Most platforms focus primarily on price and trading.",
      "Underly is built around the idea that understanding the technology and company behind an asset matters just as much as understanding its price.",
      "We want to make it easier to go from:",
      "Discover → Research → Understand → Trade",
    ],
  },
  {
    q: "Can I buy and sell assets on Underly?",
    a: [
      "Yes, where trading is available for a supported asset.",
      "Trading may be facilitated through blockchain networks, decentralized protocols, liquidity providers, exchanges, aggregators, or other third-party infrastructure.",
    ],
  },
  {
    q: "Is Underly a centralized exchange?",
    a: [
      "Underly is designed around wallet-based, non-custodial interaction.",
      "Depending on the specific functionality, transactions may interact directly with blockchain protocols and third-party infrastructure rather than requiring Underly to custody your assets.",
    ],
  },
  {
    q: "Does Underly hold my tokens?",
    a: [
      "Underly is designed so that your assets remain under your wallet's control.",
      "When you authorize a transaction, the relevant blockchain protocol or smart contract executes the transaction according to its rules.",
    ],
  },
  {
    q: "Are trades guaranteed to execute?",
    a: [
      "No.",
      "Transactions can fail or execute differently from the expected price because of:",
      [
        "Market movements",
        "Liquidity",
        "Slippage",
        "Blockchain congestion",
        "Network conditions",
        "Smart-contract conditions",
        "Third-party protocol issues",
      ],
      "Always review the transaction before approving it.",
    ],
  },
  {
    q: "What is slippage?",
    a: [
      "Slippage is the difference between the expected execution price and the actual execution price of a trade.",
      "It can occur when market prices move or when there is insufficient liquidity for your transaction.",
    ],
  },
  {
    q: "What fees do I pay?",
    a: [
      "Depending on the transaction, fees may include:",
      [
        "Blockchain network fees",
        "Protocol fees",
        "Liquidity or exchange fees",
        "Aggregator fees",
        "Any applicable Underly fees",
      ],
      "Review the transaction details before confirming your trade.",
    ],
  },
  {
    q: "Does Underly provide investment advice?",
    a: [
      "No.",
      "Underly provides research, information, analytics, and market data.",
      "Nothing on Underly should be considered financial, investment, legal, or tax advice.",
      "You are responsible for your own decisions.",
    ],
  },
  {
    q: "Can I lose money?",
    a: [
      "Yes.",
      "Digital assets can be highly volatile and may lose some or all of their value.",
      "Past performance does not guarantee future results.",
      "Only trade with funds you can afford to lose.",
    ],
  },
  {
    q: "Are Underly's insights or signals guaranteed?",
    a: [
      "No.",
      "Research, analytics, rankings, signals, and other insights are informational tools.",
      "Markets can change rapidly, and no research model or signal can guarantee a particular outcome.",
    ],
  },
  {
    q: "How does Underly select assets?",
    a: [
      "Underly may consider multiple factors, including:",
      [
        "Technology",
        "Product",
        "Team and development activity",
        "Ecosystem",
        "Adoption",
        "Tokenomics",
        "Liquidity",
        "Market activity",
        "Security considerations",
        "Available public information",
      ],
      "The methodology may evolve as Underly develops.",
    ],
  },
  {
    q: "Can an asset be removed from Underly?",
    a: [
      "Yes.",
      "Underly may add, remove, suspend, or restrict an asset at any time.",
      "Reasons may include changes in liquidity, security concerns, technical issues, project developments, regulatory considerations, or changes to our listing criteria.",
    ],
  },
  {
    q: "What happens if a transaction fails?",
    a: [
      "A blockchain transaction may fail because of network congestion, insufficient fees, smart-contract conditions, liquidity limitations, or other technical reasons.",
      "Depending on the blockchain, network fees may still be charged for a failed transaction.",
    ],
  },
  {
    q: "Can Underly reverse a blockchain transaction?",
    a: [
      "Generally, no.",
      "Confirmed blockchain transactions are typically irreversible.",
      "Always verify the asset, amount, network, and destination address before approving a transaction.",
    ],
  },
  {
    q: "What if I send assets to the wrong address?",
    a: [
      "Blockchain transactions are generally irreversible.",
      "Underly may not be able to recover assets sent to an incorrect or unsupported address.",
      "Always verify the destination address before confirming a transaction.",
    ],
  },
  {
    q: "Is my wallet information stored by Underly?",
    a: [
      "Underly does not require a traditional user account for its basic experience.",
      "When you connect a wallet, your public wallet address and blockchain activity may be visible or processed as necessary to provide Platform functionality.",
      "Blockchain information is generally public by nature.",
    ],
  },
  {
    q: "Is Underly available in every country?",
    a: [
      "Not necessarily.",
      "Digital asset laws and regulations differ between jurisdictions.",
      "Underly may restrict access to certain countries, users, assets, wallets, or transactions where required by law or for operational or compliance reasons.",
    ],
  },
  {
    q: "How can I research a company or token?",
    a: [
      "Start with the asset's Underly research page.",
      "Review the technology, product, ecosystem, tokenomics, market data, development activity, and risks.",
      "We also recommend reviewing primary sources such as the project's official documentation and technical materials before making a trading decision.",
    ],
  },
  {
    q: "How does Underly protect users?",
    a: [
      "Underly is designed around wallet-based access and does not require users to provide private keys or recovery phrases.",
      "However, no blockchain application or digital asset platform can eliminate all risks.",
      "Always verify the Underly website and transaction details before connecting or signing.",
    ],
  },
  {
    q: "Does Underly guarantee the future success of a company or token?",
    a: [
      "No.",
      "Underly's purpose is to help you discover and understand what is being built, not to predict which company or asset will succeed.",
      "The future remains uncertain.",
    ],
  },
  {
    q: "Where can I read the legal information?",
    a: [
      "You can review:",
      [
        "Privacy Policy — how Underly handles information.",
        "Terms of Use — the rules and conditions governing your use of Underly.",
      ],
    ],
  },
  {
    q: "Still have questions?",
    a: [
      "We're building Underly for people who want to understand what's next before it's obvious.",
      "For support or general questions:",
      "[support@underly.com]",
      "Discover. Trade. Own tomorrow.",
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
