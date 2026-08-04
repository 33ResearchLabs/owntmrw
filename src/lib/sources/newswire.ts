import { parseFeed, type FeedItem } from "./feeds";

/**
 * News from crypto publishers' own RSS feeds.
 *
 * Why these and not an aggregator API: CoinGecko's /news is PRO-only, the
 * projects' own sites publish no feeds (0 of 18 checked), and Google News RSS —
 * which does return excellent per-token results — licenses its feed for
 * "personal, non-commercial use" only, so it cannot back a product. Publisher
 * RSS is offered for syndication, needs no key, and carries no such limit.
 *
 * The trade-off is that these are whole-site feeds, not per-token queries: they
 * carry roughly the last 150 articles across all of crypto, and a given project
 * appears only when it is actually written about. Running the ingest on a
 * schedule is what accumulates history; a single run is only a snapshot.
 */
const FEEDS: { url: string; source: string }[] = [
  { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", source: "CoinDesk" },
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://blockworks.co/feed", source: "Blockworks" },
  { url: "https://cryptoslate.com/feed/", source: "CryptoSlate" },
];

const UA = "OwnTmrw/0.1 (+public-source intelligence aggregator)";

export interface WireItem extends FeedItem { source: string }

/** Pull the current window from every publisher. A dead feed is skipped, not fatal. */
export async function fetchWire(): Promise<WireItem[]> {
  const out: WireItem[] = [];
  await Promise.all(
    FEEDS.map(async ({ url, source }) => {
      try {
        const res = await fetch(url, {
          headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, text/xml" },
          signal: AbortSignal.timeout(20000),
        });
        if (!res.ok) return;
        for (const item of parseFeed(await res.text(), 60)) out.push({ ...item, source });
      } catch {
        // A publisher being down must not take the whole wire with it.
      }
    })
  );
  return out.sort((a, b) => b.ts - a.ts);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Per-token search via Bing's news RSS.
 *
 * The publisher feeds only surface tokens big enough for CoinDesk to cover — 2
 * of 20 here. Searching per token instead reaches the smaller outlets that
 * actually write about a $3M raise, taking coverage to roughly half the book.
 * Bing is used rather than Google News because Google licenses its feed for
 * "personal, non-commercial use" only.
 */
export async function searchNews(query: string): Promise<FeedItem[]> {
  const url = `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=RSS`;
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, text/xml" },
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return [];
    return parseFeed(await res.text(), 25);
  } catch {
    return [];
  }
}

/**
 * Ticker and SEO pages dressed as articles. These dominate the results for any
 * token with a symbol and carry no reporting whatsoever.
 */
const SPAM =
  /price prediction|price today|price analysis|forecast \d{4}|calculator|converter|exchange rate|how much is|historical data|\([A-Z0-9]+-USD\)|to (usd|cad|eur|inr|gbp)\b|live price|price chart|market cap rank/i;

/** Evidence the article concerns a crypto project rather than a namesake. */
const CRYPTO =
  /\b(crypto|token|coin|ICO|IDO|DeFi|Solana|blockchain|DAO|protocol|onchain|on-chain|raises?|raised|funding|launchpad|airdrop|staking|futarchy|presale|mainnet|testnet|web3|tokenized)\b/i;

/**
 * Names where a match survives the crypto-context test yet still is not the
 * project. Kept deliberately short: the context filter already rejects Intel's
 * "SuperClaw" and the SPAM rule kills the "Jurassic Crypto USD" ticker pages, so
 * only genuine crypto stories about an unrelated namesake reach here — Goldman
 * Sachs' CEO David Solomon, and "loyal" used as an ordinary adjective. Anything
 * added here needs the ticker to corroborate, which costs real articles, so add
 * only what has been observed to slip through.
 */
const AMBIGUOUS = /^(loyal|solomon)$/i;

export interface NewsCandidate extends FeedItem { source: string }

/**
 * Filter raw search results down to articles genuinely about this project.
 * Returns the kept items; everything rejected is discarded rather than stored,
 * because a wrong article on a token page is worse than an empty section.
 */
export function filterForProject(
  items: FeedItem[],
  name: string,
  symbol: string | null,
  source: string
): NewsCandidate[] {
  const nameRe = new RegExp(`\\b${escape(name).replace(/\s+/g, "[\\s.\\-_]?")}\\b`, "i");
  const symRe = symbol && symbol.length >= 3 ? new RegExp(`\\b${escape(symbol)}\\b`) : null;
  const needsTicker = AMBIGUOUS.test(name.replace(/\s+/g, ""));

  const seen = new Set<string>();
  const out: NewsCandidate[] = [];
  for (const it of items) {
    const t = it.title;
    if (SPAM.test(t)) continue;
    if (!nameRe.test(t)) continue;
    if (!CRYPTO.test(t)) continue;
    // An everyday word matching is not enough — the ticker has to corroborate.
    if (needsTicker && !(symRe && symRe.test(t))) continue;
    const key = t.toLowerCase().trim();
    if (seen.has(key)) continue; // Bing repeats the same story across outlets
    seen.add(key);
    out.push({ ...it, source });
  }
  return out;
}

/**
 * Articles about one project.
 *
 * Matching is on the project's name only. Ticker matching was tested and
 * rejected: it is almost pure noise at this scale — "SOLO" caught a story about
 * a solo Bitcoin miner and "META" caught one about Meta's glasses, neither of
 * which has anything to do with the token.
 */
export function matchProject(items: WireItem[], name: string, aliases: string[] = []): WireItem[] {
  const terms = [name, ...aliases].filter((t) => t && t.length >= 4);
  if (!terms.length) return [];
  const res = terms.map((t) => {
    // Publishers do not agree on how to space a name: "Rip Cars" is written
    // RipCars, Rip-Cars and Rip.Cars in the wild. Treat the separator as
    // optional so one spelling choice does not lose the article.
    const flexible = escape(t).replace(/\s+/g, "[\\s.\\-_]?");
    return new RegExp(`\\b${flexible}\\b`, "i");
  });
  return items.filter((i) => res.some((r) => r.test(i.title)));
}
