import type { Metadata } from "next";
import { LegalDoc, type LegalSection, type LegalBlock } from "@/components/LegalDoc";

/*
 * Public, for the same reason /terms is: a privacy policy behind a sign-in is
 * one a reader cannot consult before deciding whether to sign in.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Policy — Underly",
  description:
    "How Underly handles information: what is collected, how it is used, wallet and blockchain data, retention, security and your choices.",
};

/*
 * Supplied copy, held verbatim.
 *
 * Nothing in this file is authored: the wording, punctuation, capitalisation,
 * heading text, section numbering and paragraph order are all exactly as
 * provided. The only decisions made here are which lines are paragraphs, which
 * are list items, and where each section and subsection starts — that is, how
 * the text is laid out, not what it says.
 *
 * Section 11 ends with an email and a website line whose values are blank in
 * the source. They are reproduced blank rather than filled in, because a
 * contact address is the document owner's to supply.
 *
 * Any change to this document should come from the document's owner as new
 * copy, not be made in place here.
 */

const INTRO: LegalBlock[] = [
  "Welcome to Underly (“Underly,” “we,” “us,” or “our”).",
  "Underly is a technology-focused digital asset research and trading platform that provides information, analytics, market data, and access to trading of listed digital assets through supported blockchain wallets.",
  "We respect your privacy. Underly is designed so that you can use the platform without creating an account or providing personal information to us.",
];

const SECTIONS: LegalSection[] = [
  {
    id: "information-we-collect",
    title: "1. Information We Collect",
    // No prose of its own in the source — it opens straight onto 1.1.
    subsections: [
      {
        id: "personal-information",
        title: "1.1 Personal Information",
        body: [
          "Underly does not require or intentionally collect personal information such as:",
          [
            "Name",
            "Email address",
            "Phone number",
            "Residential address",
            "Date of birth",
            "Government identification",
            "Passwords",
            "Bank account information",
            "Credit or debit card information",
          ],
          "You can access Underly's research and market information without creating a traditional user account.",
        ],
      },
      {
        id: "wallet-information",
        title: "1.2 Wallet Information",
        body: [
          "To use certain trading functionality, you may connect a compatible blockchain wallet to Underly.",
          "When you connect a wallet, Underly may receive or process your public wallet address and blockchain transaction information necessary to facilitate the requested functionality.",
          "Your wallet address is publicly visible on the relevant blockchain.",
          "Underly does not receive, store, or have access to your private keys, seed phrases, recovery phrases, or wallet passwords.",
          "You remain responsible for securing your wallet and approving transactions.",
        ],
      },
      {
        id: "blockchain-data",
        title: "1.3 Blockchain Data",
        body: [
          "Transactions executed through Underly may be recorded on a public blockchain.",
          "Blockchain transactions may include information such as:",
          [
            "Wallet addresses",
            "Token amounts",
            "Transaction identifiers",
            "Token contracts or assets",
            "Transaction timestamps",
            "Transaction status",
          ],
          "Because blockchain networks are generally public and immutable, information recorded on a blockchain may remain publicly accessible even after you stop using Underly.",
        ],
      },
    ],
  },
  {
    id: "how-we-use-information",
    title: "2. How We Use Information",
    body: [
      "Underly may use wallet and blockchain information solely as necessary to provide and operate the platform, including to:",
      [
        "Display wallet-related information",
        "Display portfolio or transaction information",
        "Facilitate requested trades",
        "Display transaction status",
        "Provide market and token information",
        "Improve platform functionality and security",
        "Detect technical problems or abuse",
        "Comply with applicable legal obligations where required",
      ],
      "Underly does not sell personal information to third parties.",
    ],
  },
  {
    id: "wallet-connections",
    title: "3. Wallet Connections",
    body: [
      "Underly does not control your cryptocurrency wallet.",
      "When you connect a wallet, the wallet provider may independently process information according to its own privacy policy and terms.",
      "Underly does not request or store your:",
      ["Private key", "Seed phrase", "Recovery phrase", "Wallet password"],
      "Never provide your private keys or recovery phrase to Underly or anyone claiming to represent Underly.",
    ],
  },
  {
    id: "third-party-services",
    title: "4. Third-Party Services",
    body: [
      "Underly may rely on third-party infrastructure and services to provide market information, blockchain data, wallet connectivity, token information, analytics, hosting, or other technical functionality.",
      "These third parties may process information according to their own privacy policies.",
      "Underly is not responsible for the privacy practices of third-party services that you independently choose to use, including wallet providers and blockchain networks.",
    ],
  },
  {
    id: "cookies-and-analytics",
    title: "5. Cookies and Analytics",
    body: [
      "Underly is designed to minimize the collection of user information.",
      "If we introduce cookies, analytics technologies, or similar technologies in the future, this Privacy Policy may be updated to describe the information collected and how it is used.",
      "Where required by applicable law, we will provide appropriate notices or obtain consent.",
    ],
  },
  {
    id: "data-retention",
    title: "6. Data Retention",
    body: [
      "Underly does not maintain traditional user accounts containing personal information.",
      "Where technical logs or other operational information are temporarily generated through the operation of the platform, such information may be retained only for as long as reasonably necessary for security, troubleshooting, legal compliance, or legitimate operational purposes.",
      "Blockchain records are controlled by the relevant blockchain network and generally cannot be deleted or modified by Underly.",
    ],
  },
  {
    id: "data-security",
    title: "7. Data Security",
    body: [
      "We take reasonable technical and organizational measures to protect the systems used to operate Underly.",
      "However, no internet-connected system, blockchain network, or digital asset platform can guarantee absolute security.",
      "You are responsible for maintaining the security of your wallet, devices, credentials, and private keys.",
    ],
  },
  {
    id: "childrens-privacy",
    title: "8. Children's Privacy",
    body: [
      "Underly is not intended for individuals who are not legally permitted to use digital asset trading services under the laws applicable to them.",
      "We do not knowingly collect personal information from children.",
    ],
  },
  {
    id: "international-users",
    title: "9. International Users",
    body: [
      "Underly may be accessible from different jurisdictions.",
      "You are responsible for determining whether accessing or using Underly and trading digital assets is permitted under the laws applicable to you.",
      "Nothing on Underly should be interpreted as a representation that the platform or its services are available or appropriate in every jurisdiction.",
    ],
  },
  {
    id: "changes-to-this-privacy-policy",
    title: "10. Changes to This Privacy Policy",
    body: [
      "We may update this Privacy Policy from time to time to reflect changes to Underly, our technology, or applicable legal requirements.",
      "When we make changes, we will update the “Last Updated” date at the top of this Privacy Policy.",
      "Your continued use of Underly after an updated Privacy Policy becomes effective constitutes your acknowledgment of the updated policy, to the extent permitted by applicable law.",
    ],
  },
  {
    id: "contact",
    title: "11. Contact",
    body: [
      "If you have questions about this Privacy Policy or Underly's privacy practices, you can contact us at:",
      // A tight stack rather than two paragraphs: the lines are one contact
      // block. Both values are blank in the source and stay blank here.
      { lines: ["Email:", "Website:"] },
    ],
  },
];

/*
 * The document's closing note. It carries no heading of its own in the source,
 * so it is rendered as a trailing block rather than promoted to a numbered
 * section — naming it would be adding a heading the document does not have.
 */
const OUTRO: LegalBlock[] = [
  "Important: This Privacy Policy describes Underly's intended data practices based on the current product model. It should be reviewed by qualified legal counsel before publication, particularly because Underly provides access to digital-asset trading and may operate across multiple jurisdictions.",
];

export default function PrivacyPage() {
  return (
    <LegalDoc
      title="Privacy Policy"
      meta="Last Updated: August 8, 2026"
      intro={INTRO}
      sections={SECTIONS}
      outro={OUTRO}
    />
  );
}
