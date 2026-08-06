import { getJSON, sleep } from "./http";

/** Unauthenticated GitHub API (60 req/hr). Set GITHUB_TOKEN to raise limits. */
const HEADERS: Record<string, string> = process.env.GITHUB_TOKEN
  ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

/**
 * How many repos get the per-repo treatment (contributors, languages).
 * Every extra repo is another round trip, and unauthenticated callers only get
 * 60/hr — so the org-wide numbers come from search, and only the busiest repos
 * are walked individually.
 */
const DEEP_REPOS = 6;
const DAY = 86400;

interface Repo {
  name: string; full_name: string; stargazers_count: number; forks_count: number;
  pushed_at: string; html_url: string; fork: boolean; archived: boolean;
  language: string | null; open_issues_count: number;
}

export interface OrgStats {
  stars: number; forks: number; repos: number; lastPushTs: number;
  /** Repos pushed to within 90 days — "43 repos" flatters an org with 3 alive. */
  activeRepos: number;
  /** Of those, how many hold code rather than docs. See OrgHeadline.codeRepos. */
  codeRepos: number;
  commits90d: number | null;
  contributors: number | null;
  openIssues: number | null;
  closedIssues: number | null;
  openPRs: number | null;
  mergedPRs: number | null;
  releasesCount: number;
  lastCommitTs: number | null;
  /** Bytes per language across the walked repos, largest first. */
  languages: { name: string; bytes: number }[];
  /** Weekly [additions, deletions] for the busiest repo, oldest first. */
  codeFrequency: { week: number; additions: number; deletions: number }[];
  topRepos: { name: string; url: string; stars: number }[];
  releases: { tag: string; name: string; ts: number; url: string; repo: string }[];
  /** Most recent commits on the busiest repo — the first line of the message only. */
  recentCommits: { message: string; author: string; ts: number; url: string }[];
}

/** Extract "owner" from a github.com URL (org or user). */
export function githubOwner(url: string): string | null {
  const m = url.match(/github\.com\/([\w.-]+)/i);
  return m ? m[1] : null;
}

/**
 * Count via the search API. Search is rate-limited far more tightly than the
 * core API (10/min unauthenticated) so each of these is one call and no more.
 */
async function searchCount(q: string): Promise<number | null> {
  const res = await getJSON<{ total_count?: number }>(
    `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=1`,
    { headers: HEADERS, retries: 1 }
  );
  await sleep(2100); // stay inside the search limit
  return res?.total_count ?? null;
}

/**
 * Languages that carry documentation and configuration rather than the product.
 * A repo whose primary language is one of these is published work, but it is not
 * evidence that the protocol itself is being built in the open.
 */
const DOCS_LANGUAGES = new Set([
  "MDX", "Markdown", "HTML", "CSS", "SCSS", "Less", "Nix", "Shell", "Dockerfile", "Makefile",
]);

/** Repos whose primary language is actual code, forks and archives excluded. */
function countCodeRepos(repos: Repo[]): number {
  return repos.filter((r) => r.language && !DOCS_LANGUAGES.has(r.language)).length;
}

export interface OrgHeadline {
  stars: number; forks: number; repos: number;
  activeRepos: number; lastPushTs: number | null;
  /**
   * Repos that hold code rather than docs. Recency alone cannot tell the two
   * apart: a docs-only org pushing today scores identically to a protocol
   * shipping Rust, which flatters it badly.
   */
  codeRepos: number;
}

/**
 * The counters a single repo listing already contains — one API call, no search
 * quota, no per-repo walks.
 *
 * `orgStats` costs roughly eighteen core calls plus five search calls, so
 * thirteen orgs cannot be ingested inside the 60/hour unauthenticated ceiling.
 * This fills stars, repo counts and push recency for all of them cheaply; the
 * fields that need the deeper walks stay null rather than being guessed, and a
 * later authenticated run supersedes the row.
 *
 * Forks are excluded exactly as `orgStats` excludes them — Ranger carries 24
 * forked repos, so a naive total would report it as far busier than it is.
 */
export async function orgHeadline(owner: string): Promise<OrgHeadline | null> {
  const repos = await getJSON<Repo[]>(
    `https://api.github.com/users/${owner}/repos?per_page=100&sort=pushed`,
    { headers: HEADERS, retries: 1, timeoutMs: 15000 }
  );
  await sleep(400);
  if (!repos || !Array.isArray(repos)) return null;

  const own = repos.filter((r) => !r.fork);
  const live = own.filter((r) => !r.archived);
  const now = Date.now() / 1000;
  const pushes = own.map((r) => Date.parse(r.pushed_at) / 1000).filter((n) => Number.isFinite(n));
  return {
    stars: own.reduce((s, r) => s + r.stargazers_count, 0),
    forks: own.reduce((s, r) => s + r.forks_count, 0),
    repos: own.length,
    activeRepos: live.filter((r) => now - Date.parse(r.pushed_at) / 1000 < 90 * DAY).length,
    lastPushTs: pushes.length ? Math.max(...pushes) : null,
    codeRepos: countCodeRepos(live),
  };
}

/**
 * Weekly additions/deletions for one repo.
 *
 * GitHub computes these statistics asynchronously: the first request for a cold
 * repo returns 202 with an empty body and *starts* the job, and only a later
 * request gets the data. Giving up on the 202 means the very first ingest of a
 * repo always stores nothing, so this waits the job out.
 */
/**
 * The last few commits on one repo, real messages and all — distinct from the
 * `?per_page=1` call elsewhere in this file, which reads only the newest
 * commit's date and discards the message. `commit.author` is the raw git
 * identity (always present); the GitHub account in the top-level `author` is
 * nullable when unlinked, so the git name is what's shown, not a login.
 */
async function recentCommits(fullName: string): Promise<OrgStats["recentCommits"]> {
  const commits = await getJSON<{
    sha: string;
    html_url: string;
    commit: { message: string; author: { name: string; date: string } };
  }[]>(
    `https://api.github.com/repos/${fullName}/commits?per_page=5`,
    { headers: HEADERS, retries: 1 }
  );
  await sleep(400);
  if (!Array.isArray(commits)) return [];
  return commits.map((c) => ({
    message: c.commit.message.split("\n")[0],
    author: c.commit.author.name,
    ts: Math.floor(Date.parse(c.commit.author.date) / 1000),
    url: c.html_url,
  }));
}

async function codeFreq(fullName: string): Promise<OrgStats["codeFrequency"]> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`https://api.github.com/repos/${fullName}/stats/code_frequency`, {
        headers: { accept: "application/json", ...HEADERS },
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 202) { await sleep(3000); continue; }
      if (!res.ok) return [];
      const raw = (await res.json()) as [number, number, number][];
      if (!Array.isArray(raw)) return [];
      return raw
        .slice(-52)
        .filter((w) => Array.isArray(w) && w.length === 3)
        .map(([week, additions, deletions]) => ({ week, additions, deletions }));
    } catch {
      await sleep(1500);
    }
  }
  return [];
}

export async function orgStats(owner: string): Promise<OrgStats | null> {
  const repos = await getJSON<Repo[]>(
    `https://api.github.com/users/${owner}/repos?per_page=100&sort=pushed`,
    { headers: HEADERS }
  );
  await sleep(500);
  if (!repos || !Array.isArray(repos)) return null;

  // Forks are someone else's work; archived repos are not current output.
  const own = repos.filter((r) => !r.fork);
  const live = own.filter((r) => !r.archived);
  const stars = own.reduce((s, r) => s + r.stargazers_count, 0);
  const forks = own.reduce((s, r) => s + r.forks_count, 0);
  const lastPushTs = Math.max(0, ...own.map((r) => Date.parse(r.pushed_at) / 1000 || 0));
  const now = Date.now() / 1000;
  const activeRepos = live.filter((r) => now - Date.parse(r.pushed_at) / 1000 < 90 * DAY).length;

  const ranked = [...live].sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at));
  const topRepos = [...own]
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5)
    .map((r) => ({ name: r.name, url: r.html_url, stars: r.stargazers_count }));

  // --- org-wide counts, one search call each.
  const since = new Date((now - 90 * DAY) * 1000).toISOString().slice(0, 10);
  // GitHub's open_issues_count includes pull requests, so counting it would
  // double-count every open PR. Search with type:issue is the honest number.
  const openIssues = await searchCount(`org:${owner} type:issue state:open`);
  const closedIssues = await searchCount(`org:${owner} type:issue state:closed`);
  const openPRs = await searchCount(`org:${owner} type:pr state:open`);
  const mergedPRs = await searchCount(`org:${owner} type:pr is:merged`);

  const commitsRes = await getJSON<{ total_count?: number }>(
    `https://api.github.com/search/commits?q=${encodeURIComponent(`org:${owner} author-date:>=${since}`)}&per_page=1`,
    { headers: HEADERS, retries: 1 }
  );
  await sleep(2100);
  const commits90d = commitsRes?.total_count ?? null;

  // --- per-repo walks, capped at the busiest handful.
  const deep = ranked.slice(0, DEEP_REPOS);
  const contributorLogins = new Set<string>();
  const langBytes = new Map<string, number>();
  let sawContributors = false;
  let lastCommitTs: number | null = null;

  for (const r of deep) {
    const contribs = await getJSON<{ login: string }[]>(
      `https://api.github.com/repos/${r.full_name}/contributors?per_page=100&anon=0`,
      { headers: HEADERS, retries: 1 }
    );
    await sleep(400);
    if (Array.isArray(contribs)) {
      sawContributors = true;
      for (const c of contribs) if (c.login) contributorLogins.add(c.login);
    }

    const langs = await getJSON<Record<string, number>>(
      `https://api.github.com/repos/${r.full_name}/languages`,
      { headers: HEADERS, retries: 1 }
    );
    await sleep(400);
    for (const [name, bytes] of Object.entries(langs ?? {})) {
      langBytes.set(name, (langBytes.get(name) ?? 0) + bytes);
    }
  }

  // Last commit on the most recently pushed repo. pushed_at moves on any ref
  // update (tags, branches), so the commit list is the accurate answer. Fetching
  // 5 gives the message and author alongside the date this used to fetch alone
  // (`?per_page=1`, discarding everything but the timestamp) — one call instead
  // of two against a 60/hr ceiling.
  const commits = ranked[0] ? await recentCommits(ranked[0].full_name) : [];
  if (commits[0]) lastCommitTs = commits[0].ts;

  const codeFrequency = ranked[0] ? await codeFreq(ranked[0].full_name) : [];

  // --- releases from the two most recently pushed repos.
  const releases: OrgStats["releases"] = [];
  for (const r of ranked.slice(0, 2)) {
    const rel = await getJSON<{ tag_name: string; name: string; published_at: string; html_url: string }[]>(
      `https://api.github.com/repos/${r.full_name}/releases?per_page=5`,
      { headers: HEADERS }
    );
    await sleep(500);
    for (const x of rel ?? []) {
      if (x.published_at)
        releases.push({
          tag: x.tag_name, name: x.name || x.tag_name,
          ts: Math.floor(Date.parse(x.published_at) / 1000),
          url: x.html_url, repo: r.name,
        });
    }
  }

  return {
    stars, forks, repos: own.length, lastPushTs, activeRepos,
    codeRepos: countCodeRepos(live),
    commits90d,
    contributors: sawContributors ? contributorLogins.size : null,
    openIssues, closedIssues, openPRs, mergedPRs,
    releasesCount: releases.length,
    lastCommitTs,
    languages: [...langBytes.entries()]
      .map(([name, bytes]) => ({ name, bytes }))
      .sort((a, b) => b.bytes - a.bytes),
    codeFrequency,
    topRepos, releases, recentCommits: commits,
  };
}
