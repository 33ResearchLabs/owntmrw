/**
 * News aggregation from public feeds. No API keys: we probe a project's own
 * website for an RSS/Atom feed and parse it. X/Twitter has no keyless read API,
 * so timelines are deliberately not attempted rather than scraped unreliably.
 */

const UA = "OwnTmrw/0.1 (+public-source intelligence aggregator)";

export interface FeedItem { ts: number; title: string; url: string | null }

async function getText(url: string, timeoutMs = 15000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "user-agent": UA, accept: "application/rss+xml, application/atom+xml, text/xml, text/html" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

const strip = (s: string) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "")
   .replace(/<[^>]+>/g, "")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
   .trim();

/** Parse RSS 2.0 or Atom into items. */
export function parseFeed(xml: string, limit = 20): FeedItem[] {
  const out: FeedItem[] = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) ?? [];
  for (const b of blocks.slice(0, limit)) {
    const title = strip(b.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
    if (!title) continue;
    // RSS <link>text</link>, Atom <link href="..."/>
    const link =
      b.match(/<link[^>]*href=["']([^"']+)["']/i)?.[1] ??
      strip(b.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1] ?? "") ??
      null;
    const dateStr =
      b.match(/<pubDate[^>]*>([\s\S]*?)<\/pubDate>/i)?.[1] ??
      b.match(/<updated[^>]*>([\s\S]*?)<\/updated>/i)?.[1] ??
      b.match(/<published[^>]*>([\s\S]*?)<\/published>/i)?.[1] ??
      b.match(/<dc:date[^>]*>([\s\S]*?)<\/dc:date>/i)?.[1] ?? "";
    const parsed = Date.parse(strip(dateStr));
    if (!Number.isFinite(parsed)) continue;
    out.push({ ts: Math.floor(parsed / 1000), title, url: link || null });
  }
  return out;
}

/** Common feed locations, plus any <link rel=alternate> the homepage declares. */
export async function discoverFeed(site: string): Promise<string | null> {
  let base: URL;
  try { base = new URL(site); } catch { return null; }

  const html = await getText(base.origin);
  if (html) {
    const m = html.match(
      /<link[^>]+rel=["']alternate["'][^>]+type=["']application\/(?:rss|atom)\+xml["'][^>]*>/i
    );
    const href = m?.[0].match(/href=["']([^"']+)["']/i)?.[1];
    if (href) {
      try { return new URL(href, base.origin).toString(); } catch { /* fall through */ }
    }
  }
  // Most of these projects have no blog at all, so keep the probe short.
  for (const path of ["/feed", "/rss.xml", "/blog/feed"]) {
    const url = new URL(path, base.origin).toString();
    const body = await getText(url, 6000);
    if (body && /<(rss|feed)\b/i.test(body)) return url;
  }
  return null;
}

export async function fetchFeed(url: string): Promise<FeedItem[]> {
  const xml = await getText(url);
  return xml ? parseFeed(xml) : [];
}

/**
 * GitHub publishes an Atom feed of releases and commits per repository with no
 * key required — the most reliable public announcement channel these projects
 * have, since most have no blog and X has no keyless read API.
 */
export async function githubFeeds(owner: string, repo: string): Promise<FeedItem[]> {
  const out: FeedItem[] = [];
  for (const kind of ["releases", "tags"]) {
    const items = await fetchFeed(`https://github.com/${owner}/${repo}/${kind}.atom`);
    for (const it of items) {
      if (!out.some((o) => o.title === it.title)) out.push(it);
    }
  }
  return out;
}
