import type { GithubSnapshot, Language, CodeWeek, ProjectDetail } from "@/lib/queries";
import type { DevScore } from "@/lib/analytics";
import { scoreColor } from "@/lib/analytics";
import { fmtNum, timeAgo } from "@/lib/format";
import { SectionCard, DataGap } from "./panels";
import { TrendCard } from "./viz";
import { DAY, changeVsAgo } from "@/lib/series";

/** Distinct hues for the language bar; falls back to grey past the eighth. */
const LANG_COLORS = [
  "#3987e5", "#0ca30c", "#fab219", "#d55181", "#9085e9", "#199e70", "#d95926", "#c98500",
];

function Stat({ label, value, sub, tone }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "good" | "bad";
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-[0.07em] text-muted">{label}</div>
      <div className={`num mt-0.5 text-[18px] font-semibold leading-tight ${
        tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : ""
      }`}>
        {value}
      </div>
      {sub != null && <div className="mt-0.5 text-[11px] leading-snug text-ink2">{sub}</div>}
    </div>
  );
}

/** Value or an em dash — a metric the API did not return is never shown as 0. */
const orDash = (n: number | null | undefined) => (n == null ? <span className="text-muted">—</span> : fmtNum(n));

function LanguageBar({ languages }: { languages: Language[] }) {
  const total = languages.reduce((s, l) => s + l.bytes, 0);
  if (!total) return null;
  const shown = languages.slice(0, 8);
  return (
    <div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-grid">
        {shown.map((l, i) => (
          <div
            key={l.name}
            style={{ width: `${(l.bytes / total) * 100}%`, background: LANG_COLORS[i] ?? "var(--ink-faint)" }}
            title={`${l.name} — ${((l.bytes / total) * 100).toFixed(1)}%`}
          />
        ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
        {shown.map((l, i) => (
          <span key={l.name} className="flex items-center gap-1.5 text-[11.5px] text-ink2">
            <span className="h-2 w-2 rounded-full" style={{ background: LANG_COLORS[i] ?? "var(--ink-faint)" }} />
            {l.name}
            <span className="num text-muted">{((l.bytes / total) * 100).toFixed(1)}%</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Weekly additions above the axis, deletions below — GitHub's own code
 * frequency shape. Bars are scaled to the busiest week in the window.
 */
function CodeFrequency({ weeks }: { weeks: CodeWeek[] }) {
  const peak = Math.max(1, ...weeks.map((w) => Math.max(w.additions, Math.abs(w.deletions))));
  const added = weeks.reduce((s, w) => s + w.additions, 0);
  const removed = weeks.reduce((s, w) => s + Math.abs(w.deletions), 0);
  return (
    <div>
      <div className="flex h-24 items-center gap-px overflow-hidden">
        {weeks.map((w) => (
          <div key={w.week} className="flex h-full flex-1 flex-col justify-center" title={
            `${new Date(w.week * 1000).toISOString().slice(0, 10)}: +${w.additions.toLocaleString()} / −${Math.abs(w.deletions).toLocaleString()}`
          }>
            <div className="flex h-1/2 flex-col justify-end">
              <div style={{ height: `${(w.additions / peak) * 100}%`, background: "var(--good)", minHeight: w.additions > 0 ? 1 : 0 }} />
            </div>
            <div className="flex h-1/2 flex-col justify-start">
              <div style={{ height: `${(Math.abs(w.deletions) / peak) * 100}%`, background: "var(--bad)", minHeight: w.deletions !== 0 ? 1 : 0 }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-[11px] text-muted">
        <span><span className="text-good">+{fmtNum(added)}</span> added</span>
        <span><span className="text-bad">−{fmtNum(removed)}</span> removed</span>
        <span>across {weeks.length} week{weeks.length === 1 ? "" : "s"} on the busiest repo</span>
      </div>
    </div>
  );
}

/** One numeric field of the Development grid, trended over real ingest history. */
interface TrendField {
  key: keyof ProjectDetail["githubHistory"][number] & string;
  label: string;
  color: string;
  sub?: string;
}

const TREND_FIELDS: TrendField[] = [
  { key: "commits_90d", label: "Commits (90d)", color: "var(--accent)", sub: "org-wide" },
  { key: "contributors", label: "Contributors", color: "var(--good)", sub: "unique authors" },
  { key: "stars", label: "Stars", color: "var(--warn)", sub: "across owned repos" },
  { key: "forks", label: "Forks", color: "var(--accent)" },
  { key: "open_issues", label: "Open Issues", color: "var(--warn)" },
  { key: "closed_issues", label: "Closed Issues", color: "var(--good)" },
  { key: "merged_prs", label: "Pull Requests", color: "#9b7ae0", sub: "merged" },
  { key: "active_repos", label: "Active Repositories", color: "var(--accent)", sub: "pushed in 90d" },
];

/**
 * Just the card grid — split out so the Overview tab can show the same
 * summary without the dense stat grid, language bar and code-frequency chart
 * that belong to the full Development tab underneath it. Silently omits
 * rather than explaining a gap: that DataGap treatment stays on the tab
 * where the reader came looking specifically for development activity.
 */
export function DevelopmentTrendCards({
  github, githubHistory, codeFrequency, nowSec,
}: {
  github: GithubSnapshot | null;
  githubHistory: ProjectDetail["githubHistory"];
  codeFrequency: CodeWeek[];
  nowSec: number;
}) {
  if (!github) return null;

  // Weekly lines touched on the busiest repo — the one real week-over-week
  // series GitHub's API gives us. Magnitude (additions + |deletions|) rather
  // than net, so a week that mostly deleted code reads as active instead of
  // quiet; a net figure would hide a big refactor as "-3 lines".
  const weeklyTotals = codeFrequency.map((w) => w.additions + Math.abs(w.deletions));
  const last4 = weeklyTotals.slice(-4).reduce((s, v) => s + v, 0);
  const prev4 = weeklyTotals.slice(-8, -4).reduce((s, v) => s + v, 0);
  const codeChangeDelta = prev4 > 0 ? ((last4 - prev4) / prev4) * 100 : null;

  // One card per numeric field, trended over every ingest read on file.
  // `githubHistory` is unfiltered — rows from before a field's API call
  // existed, or from a run the rate limit cut off, carry it as null — so
  // each field builds its own series rather than sharing one row filter,
  // and a field with only its latest read renders that read alone. The
  // card still shows, live value and all; only the sparkline underneath
  // defers to `Sparkline`'s own "needs more history" state.
  const trendCards = TREND_FIELDS.map((f) => {
    const series = githubHistory
      .map((h) => ({ ts: h.ts, v: h[f.key] }))
      .filter((r): r is { ts: number; v: number } => r.v != null);
    if (!series.length) return null;
    const current = series[series.length - 1].v;
    return (
      <TrendCard
        key={f.key}
        color={f.color} label={f.label}
        value={fmtNum(current)}
        deltaPct={changeVsAgo(current, series, 30 * DAY, nowSec)}
        deltaLabel="vs 30d ago"
        series={series.map((s) => s.v)}
      />
    );
  }).filter(Boolean);

  if (!trendCards.length && !weeklyTotals.length) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {trendCards}
      {weeklyTotals.length > 0 && (
        <TrendCard
          color="var(--warn)" label="Code Changes (30d)"
          value={fmtNum(last4)}
          deltaPct={codeChangeDelta} deltaLabel="vs previous 30d"
          series={weeklyTotals}
        />
      )}
    </div>
  );
}

export function DevelopmentPanel({
  github, languages, codeFrequency, score, githubUrl, releaseCount, recentCommits,
}: {
  github: GithubSnapshot | null;
  languages: Language[];
  codeFrequency: CodeWeek[];
  score: DevScore;
  githubUrl: string | null;
  releaseCount: number;
  recentCommits: ProjectDetail["recentCommits"];
}) {
  if (!githubUrl) {
    return (
      <SectionCard title="Development">
        <div className="p-4">
          <DataGap
            title="No GitHub organisation linked"
            why="Engineering output cannot be verified for this project because no public repository is recorded."
            unlock="Add a github.com organisation or user URL to the project record."
          />
        </div>
      </SectionCard>
    );
  }

  if (!github) {
    return (
      <SectionCard title="Development">
        <div className="p-4">
          <DataGap
            title="GitHub is linked, but no snapshot has been taken"
            why="The repository is on file but the GitHub API has not been read for this project yet, so no activity metrics exist."
            unlock="Run the ingest; set GITHUB_TOKEN to lift the API ceiling from 60 to 5,000 requests an hour."
          />
        </div>
      </SectionCard>
    );
  }

  const issueTotal = (github.open_issues ?? 0) + (github.closed_issues ?? 0);
  const closeRate = github.closed_issues != null && issueTotal > 0
    ? (github.closed_issues / issueTotal) * 100 : null;

  return (
    <div className="space-y-5">
      <SectionCard
        title="Development"
        right={
          <div className="flex items-center gap-3">
            {score.overall != null && (
              <span className="flex items-center gap-1.5 text-[11px] text-muted">
                Developer Score
                <span className="num text-[13px] font-semibold" style={{ color: scoreColor(score.overall) }}>
                  {score.overall}
                </span>
                <span className="text-faint">/100</span>
              </span>
            )}
            <a
              href={githubUrl} target="_blank" rel="noopener noreferrer"
              className="text-[11px] text-accent hover:underline"
            >
              repository ↗
            </a>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 px-4 py-4 sm:grid-cols-3 lg:grid-cols-4">
          <Stat
            label="Commits (90d)" value={orDash(github.commits_90d)}
            sub={github.commits_90d == null ? "search API unavailable" : "org-wide"}
          />
          <Stat label="Contributors" value={orDash(github.contributors)} sub="unique authors" />
          <Stat label="Releases" value={fmtNum(releaseCount)} sub="tagged versions indexed" />
          <Stat label="Stars" value={orDash(github.stars)} sub="across owned repos" />
          <Stat label="Forks" value={orDash(github.forks)} />
          <Stat
            label="Open Issues" value={orDash(github.open_issues)}
            sub={github.open_issues == null ? undefined : "excludes pull requests"}
          />
          <Stat
            label="Closed Issues" value={orDash(github.closed_issues)}
            sub={closeRate != null ? `${closeRate.toFixed(0)}% close rate` : undefined}
            tone={closeRate != null && closeRate >= 70 ? "good" : undefined}
          />
          <Stat
            label="Pull Requests"
            value={
              github.open_prs == null && github.merged_prs == null
                ? <span className="text-muted">—</span>
                : <>{fmtNum(github.merged_prs)}<span className="text-[13px] font-normal text-muted"> merged</span></>
            }
            sub={github.open_prs != null ? `${fmtNum(github.open_prs)} open` : undefined}
          />
          <Stat
            label="Active Repositories"
            value={github.active_repos == null ? <span className="text-muted">—</span> : fmtNum(github.active_repos)}
            sub={github.repos != null ? `of ${github.repos} total · pushed in 90d` : undefined}
          />
          <Stat
            label="Last Commit"
            value={<span className="text-[16px]">{timeAgo(github.last_commit_ts ?? github.last_push_ts)}</span>}
            sub={github.last_commit_ts == null && github.last_push_ts != null ? "from push time" : undefined}
          />
          <Stat
            label="Languages"
            value={languages.length ? <span className="text-[16px]">{languages[0].name}</span> : <span className="text-muted">—</span>}
            sub={languages.length > 1 ? `+${languages.length - 1} more` : undefined}
          />
          <Stat
            label="GitHub Activity"
            value={
              <span className="text-[16px]" style={{ color: scoreColor(score.overall) }}>
                {score.overall == null ? "—" : score.overall >= 70 ? "Active" : score.overall >= 40 ? "Moderate" : "Quiet"}
              </span>
            }
            sub={`${score.measured} of ${score.total} signals measured`}
          />
        </div>
      </SectionCard>

      {recentCommits.length > 0 && (
        <SectionCard title="Recent Commits">
          <div className="divide-y divide-grid">
            {recentCommits.map((c) => {
              // The short sha shown alongside each row is not stored — it's
              // the last path segment of the commit URL, sliced to 7 chars,
              // the same identifier GitHub itself shows in its UI.
              const sha = c.url?.split("/").pop()?.slice(0, 7);
              return (
                <div key={c.url ?? c.ts} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[13px] text-ink">{c.message}</div>
                    {c.author && <div className="mt-0.5 text-[11px] text-muted">{c.author}</div>}
                  </div>
                  {sha && (
                    <a
                      href={c.url ?? undefined} target="_blank" rel="noopener noreferrer"
                      className="num shrink-0 text-[11px] text-ink2 hover:text-accent"
                    >
                      {sha}
                    </a>
                  )}
                  <span className="w-16 shrink-0 text-right text-[11px] text-muted">{timeAgo(c.ts)}</span>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {score.parts.length > 0 && (
        <SectionCard
          title="Developer Score"
          right={<span className="text-[11px] text-muted">{score.measured} of {score.total} signals measured</span>}
        >
          <div className="space-y-2.5 px-4 py-4">
            {score.parts.map((p) => (
              <div key={p.key} className="flex items-center gap-3">
                <span className="w-[104px] shrink-0 text-[12px] text-ink2">{p.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-grid">
                  {p.score != null && (
                    <div className="h-full rounded-full" style={{ width: `${p.score}%`, background: scoreColor(p.score) }} />
                  )}
                </div>
                <span className="num w-8 shrink-0 text-right text-[12px] font-medium">
                  {p.score ?? <span className="text-muted">—</span>}
                </span>
                <span className="hidden w-[190px] shrink-0 truncate text-[11px] text-muted sm:block" title={p.detail}>
                  {p.detail}
                </span>
              </div>
            ))}
          </div>
          {score.measured < score.total && (
            <p className="border-t border-grid px-4 py-2.5 text-[11px] text-muted">
              Signals GitHub did not return are excluded from the composite rather than scored as zero.
            </p>
          )}
        </SectionCard>
      )}

      {languages.length > 0 && (
        <SectionCard
          title="Languages"
          right={<span className="text-[11px] text-muted">by bytes, across the busiest repos</span>}
        >
          <div className="px-4 py-4"><LanguageBar languages={languages} /></div>
        </SectionCard>
      )}

      {codeFrequency.length > 0 && (
        <SectionCard title="Code Frequency" right={<span className="text-[11px] text-muted">weekly additions / deletions</span>}>
          <div className="px-4 py-4"><CodeFrequency weeks={codeFrequency} /></div>
        </SectionCard>
      )}
    </div>
  );
}
