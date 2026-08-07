/**
 * Project profile registry.
 *
 * Identity and social links for each project, recorded by hand from official
 * sources. The automated path fills these from DexScreener's pair metadata and
 * GeckoTerminal's token info, but both only carry whatever the team submitted
 * to them — which for most of these launches is a website and nothing else, and
 * for several is stale or absent entirely. Neither aggregator publishes a docs
 * URL at all, which is why `docs` stood at 1 of 23 while most of these projects
 * do have documentation sites.
 *
 * Every field is optional and a missing one stays missing: the UI renders an
 * em-dash rather than a guess, exactly as `RAISES` does for unpublished ICO
 * figures. A link recorded here was confirmed reachable from the project's own
 * site or verified account — `sourceUrl` says from where.
 *
 * Records that carry no fields at all are deliberate. They record that a link
 * was looked for and verifiably does not exist, so the absence reads as a
 * finding rather than as work nobody has done yet — the same distinction
 * ingest draws for projects with no RAISES entry.
 *
 * Applied in ingest *before* the aggregator fills gaps. The aggregator writes
 * with `p.website ?? s.website`, so a value recorded here is already in place
 * and wins over a stale submission without needing a special case.
 */

/** The columns this registry is allowed to write. All match `projects` 1:1. */
export type ProfileField =
  | "website" | "twitter" | "discord" | "telegram"
  | "github" | "docs" | "description" | "category";

export interface ProfileRecord {
  /** Matches `projects.slug` — unlike RAISES, which keys on symbol. */
  slug: string;
  website?: string;
  /** Canonical https://x.com/handle form. */
  twitter?: string;
  discord?: string;
  telegram?: string;
  /** The GitHub org or user page, not an individual repo. */
  github?: string;
  /** A dedicated documentation site — not the marketing homepage. */
  docs?: string;
  /** How the project describes itself, in its own words. */
  description?: string;
  /** Short sector label, e.g. "Payments", "Lending / AMM". */
  category?: string;
  /**
   * Columns whose stored value was probed and found dead. These are cleared
   * late in ingest rather than here: an aggregator re-supplies the same dead
   * value every run, so clearing it before the market step would be undone
   * minutes later. Only for links confirmed gone at the protocol level (NXDOMAIN,
   * a Discord invite the API disowns) — never for one that merely failed to load.
   */
  dead?: ProfileField[];
  /** Where these were confirmed. */
  sourceUrl?: string;
  note?: string;
}

/** The writable fields, listed so ingest can copy them without also copying
 *  `dead`, `note` and `sourceUrl` — which are metadata, not columns. */
export const PROFILE_FIELDS: ProfileField[] = [
  "website", "twitter", "discord", "telegram", "github", "docs", "description", "category",
];

export const PROFILES: ProfileRecord[] = [
  {
    slug: "areal-finance",
    docs: "https://docs.areal.finance",
    sourceUrl: "https://github.com/ArealFinance/docs",
    note: "Mintlify site built from the project's own docs repo, and the docs URL cited in its Futardio launch write-up. No Discord or Telegram exists: the repo's docs.json lists only x + github as socials, and the site bundles contain neither. A third-party directory lists an @ARL_Community_Hub Telegram that no official Areal property references — rejected. The README's areal.finance/docs path only returns the SPA shell, which answers 200 for any path.",
  },
  {
    slug: "avici",
    github: "https://github.com/Avici-Labs",
    docs: "https://docs.avici.money/",
    description:
      "Avici is building an internet neobank powered by crypto for people who hold digital assets, spend globally and want borderless, frictionless banking. Users hold crypto in self-custody and spend it directly through a secured Visa credit card, without needing a traditional bank or exchange.",
    sourceUrl: "https://docs.avici.money/",
    note: "Docs linked from the homepage nav. The GitHub org sets no bio or website, so it was tied to the project through repo content instead: its v-mcp README describes an 'avici account — wallets, cards, balances' and its redirect deployment points at the App Store listing 'Avici - Spend Crypto Easily', matching the app download link on avici.money.",
  },
  {
    slug: "basket",
    website: "https://basketsolana.xyz",
    twitter: "https://x.com/Basket_on_sol",
    category: "Index Tokens",
    sourceUrl: "https://www.futard.io/",
    note: "The futard.io launch record carries baseMintAcct 2rNBaMg…PFNmeta with websiteUrl basketsolana.xyz and a subDescription identical to the stored one, which is what makes this an exact match rather than a name match. The X account is the only social on that site. No Discord, Telegram, GitHub or docs exist. Note app.basketsolana.xyz references a different mint (5yTFbtAE…QtSpk) — the team's earlier hackathon IdeaCoin, not this token.",
  },
  {
    slug: "credible-finance",
    docs: "https://docs.credible.finance/",
    description:
      "Credible is an open payments stack for internet businesses, offering pay-in and pay-out, global USD/EUR collection accounts, on-chain liquidity, and Creddy, a universal stablecoin payment method. It accepts payments over cards and local rails such as UPI, SEPA and ACH, and settles merchants instantly from a stablecoin liquidity pool.",
    sourceUrl: "https://credible.finance/",
    note: "Linked from the homepage as 'API Docs'. The homepage also links credible.gitbook.io, but that is labelled 'Whitepaper', so it is not the docs site. No Discord on the homepage, app, blog or referral pages despite third-party airdrop posts claiming a Discord task.",
  },
  {
    slug: "flash-trade",
    docs: "https://docs.flash.trade",
    sourceUrl: "https://docs.flash.trade/flash-trade",
    note: "No Telegram: the docs' own troubleshooting page routes support to Discord only, CoinGecko's link panel for FAF lists every social except Telegram, and a grep of all 40 site bundles for t.me found nothing. Discord-only project.",
  },
  {
    slug: "futardio-cult",
    sourceUrl: "https://www.futard.io/launch/3EZBeQPQNHYkxnbrMRXG56DK1QRG8DR7VhYAUyvUFBzK",
    note: "No links of any kind, verified. The launch payload carries twitterUrl:\"\" and telegramUrl:null and has no socials array. Every GitHub/Telegram/docs link rendered on that page is futard.io's own site chrome (metaDAOproject, docs.metadao.fi) and belongs to the platform, not the token — worth knowing before anyone harvests that page again.",
  },
  {
    slug: "gesim",
    website: "https://gesim.xyz",
    twitter: "https://x.com/GeSIMxyz",
    telegram: "https://t.me/gesimxyz",
    docs: "https://gesim.gitbook.io/gesim",
    sourceUrl: "https://www.futard.io/launch/9qEQo5P6kwcWg1YhyPB5CEX6MAzufsT3a25HuxQg7WhC",
    note: "The launch filing embeds an explicit socials array — a source the automated path never reads — giving four fields at once, all verified 200. No Discord: discord.gg/gesim is disowned by the Discord API. No GitHub: github.com/GeSIM is an empty account with no repos and no link back. Distinct from the same-space Depinsim/ESIM token.",
  },
  {
    slug: "hurupay",
    website: "https://hurupay.com",
    twitter: "https://x.com/HurupayApp",
    sourceUrl: "https://github.com/Hurupay",
    note: "Both read off the GitHub org profile; the X account independently corroborates by having posted the MetaDAO launch announcement. The site is live despite the failed raise — it serves a Cloudflare challenge to automated fetches, so a naive probe reads it as dead. docs.hurupay.com is NXDOMAIN and was not recorded. Signs of a rebrand to 'Kolan' (kolan.xyz, @kolan_xyz); @HurupayApp still resolves, so the Hurupay-branded values stand until that settles.",
  },
  {
    slug: "jurassic",
    sourceUrl: "https://jurassic.finance/",
    note: "Verified absent, not unresearched. The rendered site's only outbound links are its X account, its MetaDAO project page and a Jupiter token link. docs.jurassic.finance has no DNS, /docs 404s, and github.com/jurassic-finance and /jurassicfi both 404.",
  },
  {
    slug: "kimia",
    website: "https://kimia.live/",
    twitter: "https://x.com/KimiaProtocol",
    telegram: "https://t.me/communitykimia",
    docs: "https://docs.kimia.live/",
    category: "Yield / Perps",
    sourceUrl: "https://docs.kimia.live/introduction",
    note: "The GitHub org profile was the only known-good link and it carried both the website and the X handle, which unlocked the rest from the site footer. Telegram verified live. No Discord anywhere. The litepaper is a Google Drive PDF and is deliberately not recorded as docs.",
  },
  {
    slug: "laso-finance",
    docs: "https://docs.laso.finance/",
    sourceUrl: "https://docs.laso.finance/",
    note: "Confirmed by content, not just domain: its page index covers the LASO token, the ICO, 'Why MetaDAO' and team allocation. No Discord — a grep of the full docs index returned zero Discord URLs; the project uses Telegram. help.laso.finance is a separate support centre, not the docs.",
  },
  {
    slug: "loyal",
    docs: "https://docs.askloyal.com/",
    sourceUrl: "https://askloyal.com",
    note: "Linked directly from the homepage. Mintlify-hosted; its bot protection 403s a plain fetch, so it verifies only with a browser user-agent.",
  },
  {
    slug: "omnipair",
    telegram: "https://t.me/omnipair",
    docs: "https://docs.omnipair.fi",
    sourceUrl: "https://docs.omnipair.fi/",
    note: "The Telegram is the one lower-confidence link in this registry: it is not reachable from the site or docs, whose links section lists only Discord, Dune, GitHub and X. It is recorded because the group's own description cites the known-good website, the known-good X account and the exact OMFG mint. Corroboration by self-reference rather than by an official outbound link.",
  },
  {
    slug: "ordr",
    website: "https://ordr.trade",
    twitter: "https://x.com/ordrtrade",
    category: "Orderbook DEX",
    sourceUrl: "https://github.com/CHA0S-LABS",
    note: "The GitHub org's API record carries blog=ordr.trade and twitter_username=ordrtrade. The apex was unreachable from the research host, so it was confirmed against a mirror serving the identical page with canonical=https://ordr.trade and the exact stored description. Every href on it was dumped: no Discord, Telegram or docs exist, and docs.ordr.trade has no DNS. Categorised as a spot on-chain CLOB, not perps.",
  },
  {
    slug: "p2p-protocol",
    docs: "https://docs.p2p.foundation",
    sourceUrl: "https://docs.p2p.foundation/",
    note: "Disambiguated deliberately — this is a crowded name. Confirmed by its footer linking the exact known-good Telegram and X account, and by its docs repo sitting under the known-good GitHub org. Not the wiki.p2pfoundation.net wiki and not p2p.org the validator company. Its footer advertises a second Discord invite (4Ftpq4eJuC) alongside the stored one; both are live, so the stored value was left alone.",
  },
  {
    slug: "paystream",
    docs: "https://docs.paystream.finance",
    sourceUrl: "https://docs.paystream.finance/introduction",
    note: "The docs index lists exactly three external links — whitepaper, the known-good Telegram, and the site — and no Discord appears there or anywhere on the marketing site. Their FAQ carries a bare t.me/Paystream typo; the canonical handle is t.me/Paystreamfi, which is what is already stored.",
  },
  {
    slug: "ranger",
    docs: "https://docs.ranger.finance",
    sourceUrl: "https://docs.ranger.finance/",
    note: "Docs footer links the known-good GitHub and X account and its content references RNGR, Ranger Earn and rgUSD. No Discord exists across the docs footer, the X bio or the Telegram channel bio. See the website note in the ingest prune step — the stored app.ranger.finance is currently a disabled deployment.",
  },
  {
    slug: "rip-cars",
    description:
      "Rip Cars is the world's first Hot Wheels gacha platform. Real die-cast cars are sealed inside every pack — rip the pack, reveal your dream car, then hold it, trade it, or sell it back.",
    sourceUrl: "https://ripcars.io/",
    note: "Description stitched only from the project's own X bio and site meta. The site is a single-bundle SPA that answers 200 for every path, so a /docs probe proves nothing — the bundle itself was searched instead and contains no discord, t.me, docs or gitbook string at all. An aggregator lists t.me/ripcarsio, but that URL renders Telegram's generic fallback with no title, photo or member count, which is indistinguishable from a username that does not exist. Rejected.",
  },
  {
    slug: "solomon",
    docs: "https://docs.solomonlabs.org",
    sourceUrl: "https://docs.solomonlabs.org/",
    note: "Reached from both the homepage and the linktree in the X bio. Documents USDv and the Solomon Platform rather than the SOLO token specifically, but it is unambiguously this project's docs site and links back to the known-good X account.",
  },
  {
    slug: "superclaw",
    sourceUrl: "https://superclaw.org/",
    note: "Verified absent against a crowded namespace. All ten site chunks (~587KB) were downloaded and searched: the only external URLs are the known-good X and Telegram plus a Jupiter token link. docs. and app.superclaw.org have no DNS, and /docs, /documentation, /guide, /help, /learn and /whitepaper all 404. Four same-name impostors were found and rejected — superclaw.ai, superclaw.io, superclaws.ai and a SuperagenticAI repo. Do not let a future pass adopt any of them.",
  },
  {
    slug: "umbra",
    docs: "https://docs.umbraprivacy.com",
    description:
      "Umbra is the financial privacy layer for Solana, providing the infrastructure for confidential, unlinkable, and auditable transactions. It lets users shield assets with zero fees, keeping their finances visible to no one but themselves.",
    dead: ["discord"],
    sourceUrl: "https://docs.umbraprivacy.com/docs/introduction",
    note: "The stored Discord invite is disowned by the Discord API (Unknown Invite, 10006), so it is cleared rather than displayed. No Telegram recorded: three plausible t.me candidates exist and not one is referenced by the site, the docs, the GitHub org or MetaDAO's own link list, which names only website, X, Discord and GitHub. This is the Solana project on umbraprivacy.com, not the Ethereum umbra.cash/ScopeLift project of the same name.",
  },
  {
    slug: "zklsol",
    dead: ["website"],
    sourceUrl:
      "https://web.archive.org/web/20260314160632/https://www.metadao.fi/projects/zklsol",
    note: "The project has gone dark: zklsol.org, docs.zklsol.org and app.zklsol.org all have no DNS record, so the stored website is cleared. docs.zklsol.org was genuinely the official docs per MetaDAO's page and the archived homepage, but recording a URL that no longer resolves would be worse than recording nothing. The team pivoted to 'Zinc' under Turbine Cash DAO LLC, and whether that IP belongs to ZKFG holders is contested (MetaDAO proposal ZKFG 007) — no zinc.cash link is attributed here, because that attribution is precisely what is in dispute. Two candidate GitHub orgs exist and both are empty shells with zero repos.",
  },
];

export function profileFor(slug: string | null | undefined): ProfileRecord | undefined {
  if (!slug) return undefined;
  return PROFILES.find((p) => p.slug === slug);
}
