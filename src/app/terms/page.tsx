import type { Metadata } from "next";
import { LegalDoc, type LegalSection, type LegalBlock } from "@/components/LegalDoc";

/*
 * Public, like the home and project pages — `proxy.ts` gates only the four
 * signed-in areas, and a terms page a reader has to sign in to read is not a
 * terms page. Nothing here touches the session.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Use — Underly",
  description:
    "The terms governing access to and use of the Underly platform, including eligibility, wallet connection, trading, risks, disclaimers and liability.",
};

/*
 * Supplied copy, held verbatim.
 *
 * Nothing in this file is authored: the wording, punctuation, capitalisation,
 * heading text, section numbering and paragraph order are all exactly as
 * provided. The only decisions made here are which lines are paragraphs, which
 * are list items and where each section starts — that is, how the text is laid
 * out, not what it says.
 *
 * The bracketed fields in sections 23 and 26 are the document's own blanks and
 * are reproduced as written, including the brackets. They are deliberately not
 * marked up or styled: a legal document's placeholders are its author's to
 * resolve, and decorating them would be this file editing the text.
 *
 * Any change to this document should come from the document's owner as new
 * copy, not be made in place here.
 */

const INTRO: LegalBlock[] = [
  "Welcome to Underly (“Underly,” “we,” “us,” or “our”).",
  "These Terms of Use (“Terms”) govern your access to and use of the Underly website, platform, applications, interfaces, research, market information, token listings, trading functionality, and related services (collectively, the “Platform”).",
  "By accessing or using Underly, connecting a wallet, viewing token information, or initiating a transaction through the Platform, you acknowledge that you have read, understood, and agreed to these Terms.",
  "If you do not agree with these Terms, you must not use Underly.",
];

const SECTIONS: LegalSection[] = [
  {
    id: "about-underly",
    title: "1. About Underly",
    body: [
      "Underly is a technology-focused digital asset platform designed to provide users with information, research, analytics, market data, and access to trading of selected digital assets.",
      "Underly may provide information regarding technology-focused tokens and digital assets, including information about their underlying technology, protocols, ecosystems, market activity, tokenomics, risks, and other relevant characteristics.",
      "Underly does not guarantee that any token listed on the Platform will increase in value or remain available for trading.",
    ],
  },
  {
    id: "eligibility",
    title: "2. Eligibility",
    body: [
      "You may use Underly only if:",
      [
        "You are legally permitted to access digital asset services in your jurisdiction;",
        "You are legally capable of entering into a binding agreement;",
        "Your use of the Platform does not violate any law or regulation applicable to you; and",
        "You are not using the Platform on behalf of a sanctioned person or entity or for an unlawful purpose.",
      ],
      "You are responsible for determining whether your use of Underly is permitted under the laws applicable to you.",
      "Underly may restrict or prohibit access from certain jurisdictions, users, wallets, or addresses at any time.",
    ],
  },
  {
    id: "wallet-connection",
    title: "3. Wallet Connection",
    body: [
      "Underly may allow you to connect a compatible blockchain wallet to access certain Platform functionality.",
      "Underly does not require you to create a traditional account unless a particular feature requires otherwise.",
      "You are solely responsible for:",
      [
        "Your wallet;",
        "Your private keys;",
        "Your seed or recovery phrase;",
        "Your wallet password;",
        "Your device security;",
        "Transactions initiated from your wallet; and",
        "Reviewing and approving blockchain transactions.",
      ],
      "Underly will never ask you for your private key, seed phrase, or recovery phrase.",
      "Underly does not assume responsibility for the loss, theft, compromise, or unauthorized use of your wallet.",
    ],
  },
  {
    id: "trading-digital-assets",
    title: "4. Trading Digital Assets",
    body: [
      "Underly may provide functionality that allows users to buy, sell, swap, or otherwise transact in supported digital assets.",
      "Transactions may be executed through blockchain networks, decentralized protocols, smart contracts, liquidity providers, exchanges, aggregators, or other third-party infrastructure.",
      "Once a blockchain transaction has been submitted and confirmed, it may be irreversible.",
      "You are responsible for reviewing transaction details before approving a transaction, including:",
      [
        "Asset;",
        "Amount;",
        "Price;",
        "Network;",
        "Wallet address;",
        "Transaction fees;",
        "Slippage;",
        "Smart-contract permissions; and",
        "Any other transaction parameters displayed to you.",
      ],
      "Underly does not guarantee that a transaction will execute successfully, at a particular price, within a particular time, or without loss.",
    ],
  },
  {
    id: "no-investment-advice",
    title: "5. No Investment Advice",
    body: [
      "All information provided through Underly is provided for informational and research purposes only.",
      "Nothing available on the Platform constitutes:",
      [
        "Investment advice;",
        "Financial advice;",
        "Trading advice;",
        "Legal advice;",
        "Tax advice;",
        "Accounting advice;",
        "A recommendation to buy or sell any digital asset; or",
        "A guarantee of future performance.",
      ],
      "Research, ratings, scores, signals, analytics, token descriptions, market data, or other information presented by Underly should not be interpreted as a recommendation or solicitation to enter into a transaction.",
      "You are solely responsible for conducting your own research and making your own investment decisions.",
    ],
  },
  {
    id: "digital-asset-risks",
    title: "6. Digital Asset Risks",
    body: [
      "Digital assets are highly speculative and may involve substantial or complete loss of capital.",
      "By using Underly, you acknowledge that digital assets may be subject to:",
      [
        "Extreme price volatility;",
        "Low liquidity;",
        "Market manipulation;",
        "Smart-contract vulnerabilities;",
        "Protocol failures;",
        "Blockchain congestion;",
        "Network outages;",
        "Oracle failures;",
        "Bridge failures;",
        "Exploits and hacks;",
        "Token contract changes;",
        "Governance decisions;",
        "Regulatory changes;",
        "Fraud or malicious activity;",
        "Token delisting;",
        "Loss of market liquidity;",
        "Permanent loss of funds; and",
        "Other risks that may not currently be known.",
      ],
      "You should not use funds that you cannot afford to lose.",
    ],
  },
  {
    id: "token-listings",
    title: "7. Token Listings",
    body: [
      "Underly may select and display certain digital assets based on criteria determined by Underly.",
      "A token being listed on Underly does not mean that Underly endorses, guarantees, verifies, or recommends that token.",
      "Underly may consider factors such as:",
      [
        "Technology;",
        "Protocol activity;",
        "Market data;",
        "Liquidity;",
        "Development activity;",
        "Ecosystem;",
        "Security considerations;",
        "Availability of reliable information; and",
        "Other internal criteria.",
      ],
      "Underly may add, remove, suspend, or restrict any token at any time.",
      "A token may become unavailable without prior notice.",
    ],
  },
  {
    id: "accuracy-of-information",
    title: "8. Accuracy of Information",
    body: [
      "Underly seeks to provide useful and reliable information but does not guarantee that information displayed on the Platform is:",
      [
        "Accurate;",
        "Complete;",
        "Current;",
        "Reliable;",
        "Error-free; or",
        "Suitable for your particular circumstances.",
      ],
      "Market prices, token statistics, supply information, rankings, analytics, and other data may be obtained from third-party sources and may differ from information displayed elsewhere.",
      "You should independently verify material information before making a transaction.",
    ],
  },
  {
    id: "third-party-services",
    title: "9. Third-Party Services",
    body: [
      "Underly may integrate with or rely upon third-party services, including:",
      [
        "Blockchain networks;",
        "Wallet providers;",
        "Decentralized exchanges;",
        "Liquidity providers;",
        "Trading aggregators;",
        "Blockchain data providers;",
        "Market-data providers;",
        "Smart contracts;",
        "RPC providers; and",
        "Other infrastructure providers.",
      ],
      "Underly does not control third-party services and cannot guarantee their availability, security, accuracy, or performance.",
      "Your use of third-party services may be subject to separate terms and privacy policies.",
    ],
  },
  {
    id: "blockchain-transactions",
    title: "10. Blockchain Transactions",
    body: [
      "Blockchain networks operate independently of Underly.",
      "Underly cannot:",
      [
        "Reverse a confirmed blockchain transaction;",
        "Recover funds sent to an incorrect address;",
        "Guarantee blockchain confirmation;",
        "Control network congestion;",
        "Guarantee transaction fees;",
        "Guarantee transaction execution; or",
        "Guarantee the continued operation of any blockchain network.",
      ],
      "You are responsible for verifying transaction information before submitting a transaction.",
    ],
  },
  {
    id: "fees",
    title: "11. Fees",
    body: [
      "Certain transactions or Platform features may involve fees.",
      "These may include:",
      [
        "Underly fees;",
        "Blockchain network fees (“gas”);",
        "Protocol fees;",
        "Liquidity-provider fees;",
        "Exchange or aggregator fees; or",
        "Other third-party charges.",
      ],
      "Applicable fees should be displayed where reasonably practicable before a transaction is submitted.",
      "Blockchain network fees are determined by the relevant network and are outside Underly's control.",
    ],
  },
  {
    id: "no-guarantee-of-availability",
    title: "12. No Guarantee of Availability",
    body: [
      "Underly does not guarantee that the Platform will always be available.",
      "The Platform may become temporarily unavailable because of:",
      [
        "Maintenance;",
        "Updates;",
        "Technical failures;",
        "Cybersecurity incidents;",
        "Blockchain outages;",
        "Network congestion;",
        "Third-party failures;",
        "Regulatory requirements; or",
        "Circumstances beyond our reasonable control.",
      ],
      "We may modify, suspend, restrict, or discontinue any part of the Platform at any time.",
    ],
  },
  {
    id: "prohibited-activities",
    title: "13. Prohibited Activities",
    body: [
      "You may not use Underly to:",
      [
        "Violate any applicable law or regulation;",
        "Commit fraud;",
        "Conduct money laundering;",
        "Finance terrorism;",
        "Circumvent sanctions;",
        "Manipulate markets;",
        "Engage in deceptive trading activity;",
        "Exploit vulnerabilities for unlawful purposes;",
        "Attempt to compromise the Platform;",
        "Introduce malicious software;",
        "Interfere with Platform operations;",
        "Scrape or systematically extract Platform data without authorization;",
        "Impersonate Underly or another person;",
        "Use another person's wallet without authorization; or",
        "Conduct any activity that could reasonably harm Underly, its users, or third-party infrastructure.",
      ],
      "Underly may restrict or terminate access where we reasonably believe that prohibited activity has occurred.",
    ],
  },
  {
    id: "taxes",
    title: "14. Taxes",
    body: [
      "You are solely responsible for determining and paying any taxes that may apply to your use of Underly or transactions involving digital assets.",
      "Underly does not provide tax advice.",
      "You should consult an appropriately qualified tax professional regarding your circumstances.",
    ],
  },
  {
    id: "intellectual-property",
    title: "15. Intellectual Property",
    body: [
      "The Platform, including its software, design, branding, logos, text, graphics, interfaces, research presentation, and other original materials, is owned by or licensed to Underly and is protected by applicable intellectual-property laws.",
      "You may not copy, reproduce, distribute, modify, reverse engineer, publish, sell, or commercially exploit Underly's proprietary materials without prior written permission, except where permitted by applicable law.",
    ],
  },
  {
    id: "user-feedback",
    title: "16. User Feedback",
    body: [
      "If you provide suggestions, ideas, comments, or other feedback regarding Underly, you grant Underly the right to use that feedback for improving or developing the Platform without compensation or obligation to you, unless otherwise agreed in writing.",
    ],
  },
  {
    id: "disclaimers",
    title: "17. Disclaimers",
    body: [
      "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, THE PLATFORM AND ALL INFORMATION, CONTENT, DATA, SOFTWARE, AND SERVICES PROVIDED THROUGH THE PLATFORM ARE PROVIDED ON AN “AS IS” AND “AS AVAILABLE” BASIS.",
      "UNDERLY DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, ACCURACY, AVAILABILITY, AND RELIABILITY.",
      "UNDERLY DOES NOT GUARANTEE THAT THE PLATFORM WILL BE SECURE, UNINTERRUPTED, ERROR-FREE, OR FREE FROM VIRUSES OR OTHER HARMFUL COMPONENTS.",
    ],
  },
  {
    id: "limitation-of-liability",
    title: "18. Limitation of Liability",
    body: [
      "TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, UNDERLY AND ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, CONTRACTORS, AND SERVICE PROVIDERS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF:",
      [
        "DIGITAL ASSETS;",
        "FUNDS;",
        "PROFITS;",
        "REVENUE;",
        "BUSINESS OPPORTUNITIES;",
        "DATA;",
        "GOODWILL; OR",
        "OTHER ECONOMIC VALUE.",
      ],
      "This includes losses resulting from, among other things:",
      [
        "Market movements;",
        "Failed or delayed transactions;",
        "Blockchain failures;",
        "Smart-contract exploits;",
        "Wallet compromises;",
        "Incorrect wallet addresses;",
        "Third-party service failures;",
        "Token delistings;",
        "Network congestion;",
        "Cyberattacks; or",
        "Unauthorized access to your wallet.",
      ],
      "Nothing in these Terms is intended to exclude liability that cannot legally be excluded or limited under applicable law.",
    ],
  },
  {
    id: "indemnification",
    title: "19. Indemnification",
    body: [
      "To the maximum extent permitted by applicable law, you agree to indemnify and hold harmless Underly and its affiliates, officers, directors, employees, contractors, and service providers from claims, losses, liabilities, damages, costs, and expenses arising from:",
      [
        "Your use of the Platform;",
        "Your violation of these Terms;",
        "Your violation of applicable law;",
        "Your transactions involving digital assets;",
        "Your wallet or wallet activity; or",
        "Your infringement of another person's rights.",
      ],
    ],
  },
  {
    id: "suspension-and-termination",
    title: "20. Suspension and Termination",
    body: [
      "Underly may suspend, restrict, or terminate your access to the Platform at any time where reasonably necessary, including for:",
      [
        "Security reasons;",
        "Suspected unlawful activity;",
        "Violation of these Terms;",
        "Regulatory requirements;",
        "Technical reasons;",
        "Abuse of the Platform; or",
        "Protection of Underly or its users.",
      ],
      "Termination of access does not reverse or cancel blockchain transactions that have already been executed.",
    ],
  },
  {
    id: "regulatory-compliance",
    title: "21. Regulatory Compliance",
    body: [
      "Underly may implement additional controls, restrictions, verification procedures, transaction monitoring, or other measures where required by applicable law or regulation.",
      "The fact that Underly may currently allow access without a traditional account or identity-verification process does not mean that such access will always remain available.",
      "Where legally required, Underly may request additional information or restrict access to certain users, assets, transactions, or jurisdictions.",
    ],
  },
  {
    id: "changes-to-these-terms",
    title: "22. Changes to These Terms",
    body: [
      "We may modify these Terms from time to time.",
      "Updated Terms will be posted on the Platform with a revised “Last Updated” date.",
      "Your continued use of Underly after updated Terms become effective constitutes acceptance of the revised Terms to the extent permitted by applicable law.",
    ],
  },
  {
    id: "governing-law-and-dispute-resolution",
    title: "23. Governing Law and Dispute Resolution",
    body: [
      "These Terms and your use of Underly will be governed by the laws of [Jurisdiction], without regard to conflict-of-law principles.",
      "Any dispute arising from or relating to these Terms or the Platform will be resolved through [courts/arbitration and location], subject to applicable law.",
      "[This section should be completed by Underly's legal counsel based on the entity's incorporation and operating jurisdiction.]",
    ],
  },
  {
    id: "severability",
    title: "24. Severability",
    body: [
      "If any provision of these Terms is determined to be invalid, unlawful, or unenforceable, that provision will be interpreted to the maximum extent permitted by law, and the remaining provisions will remain in full force and effect.",
    ],
  },
  {
    id: "entire-agreement",
    title: "25. Entire Agreement",
    body: [
      "These Terms, together with the Underly Privacy Policy and any additional terms applicable to specific Platform features, constitute the entire agreement between you and Underly regarding your use of the Platform.",
    ],
  },
  {
    id: "contact",
    title: "26. Contact",
    body: [
      "For questions regarding these Terms, please contact:",
      // A tight stack rather than three paragraphs: the lines are one address
      // block, and paragraph spacing would read as three separate statements.
      { lines: ["Underly", "Email: [legal@underly.com]", "Website: [underly.com]"] },
    ],
  },
  {
    id: "important-risk-notice",
    title: "IMPORTANT RISK NOTICE",
    tone: "warn",
    body: [
      "Digital assets are highly volatile and can lose some or all of their value. Trading digital assets involves substantial risk. Do your own research before making any transaction. Underly does not provide investment, financial, legal, or tax advice and does not guarantee the performance or value of any digital asset listed on the Platform.",
    ],
  },
];

export default function TermsPage() {
  return (
    <LegalDoc
      title="Terms of Use"
      meta="Last Updated: August 8, 2026"
      intro={INTRO}
      sections={SECTIONS}
    />
  );
}
