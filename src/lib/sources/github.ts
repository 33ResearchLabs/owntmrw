import { getJSON, sleep } from "./http";

/** Unauthenticated GitHub API (60 req/hr). Set GITHUB_TOKEN to raise limits. */
const HEADERS: Record<string, string> = process.env.GITHUB_TOKEN
  ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
  : {};

interface Repo {
  name: string; full_name: string; stargazers_count: number; forks_count: number;
  pushed_at: string; html_url: string; fork: boolean;
}

export interface OrgStats {
  stars: number; forks: number; repos: number; lastPushTs: number;
  topRepos: { name: string; url: string; stars: number }[];
  releases: { tag: string; name: string; ts: number; url: string; repo: string }[];
}

/** Extract "owner" from a github.com URL (org or user). */
export function githubOwner(url: string): string | null {
  const m = url.match(/github\.com\/([\w.-]+)/i);
  return m ? m[1] : null;
}

export async function orgStats(owner: string): Promise<OrgStats | null> {
  const repos = await getJSON<Repo[]>(
    `https://api.github.com/users/${owner}/repos?per_page=100&sort=pushed`,
    { headers: HEADERS }
  );
  await sleep(500);
  if (!repos || !Array.isArray(repos)) return null;
  const own = repos.filter((r) => !r.fork);
  const stars = own.reduce((s, r) => s + r.stargazers_count, 0);
  const forks = own.reduce((s, r) => s + r.forks_count, 0);
  const lastPushTs = Math.max(0, ...own.map((r) => Date.parse(r.pushed_at) / 1000 || 0));
  const topRepos = own
    .sort((a, b) => b.stargazers_count - a.stargazers_count)
    .slice(0, 5)
    .map((r) => ({ name: r.name, url: r.html_url, stars: r.stargazers_count }));

  // latest releases from the two most recently pushed repos
  const releases: OrgStats["releases"] = [];
  for (const r of own.slice(0, 2)) {
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
  return { stars, forks, repos: own.length, lastPushTs, topRepos, releases };
}
