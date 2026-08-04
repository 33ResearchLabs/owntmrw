import type { ProjectDetail } from "./queries";
import { healthScore } from "./analytics";
import { fmtUsd, fmtNum, fmtPct } from "./format";

/**
 * An investment memo assembled from measured facts. Each bullet cites the
 * number behind it, and a point is omitted when its input is missing rather
 * than filled with a generic statement — the memo is a reading of the data,
 * not prose generated around a template.
 */
export interface Memo {
  summary: string;
  bull: string[];
  bear: string[];
  risks: string[];
  strengths: string[];
  weaknesses: string[];
  competition: string;
  developments: string[];
  momentum: string;
  outlook: string;
}

export function buildMemo(d: ProjectDetail): Memo {
  const { project: p, latest, candles, holderHistory, github, treasuryValue, events, proposals } = d;
  const hs = healthScore(d);
  const sym = p.symbol ?? p.name;

  const ath = candles.length ? Math.max(...candles.map((c) => c.h)) : null;
  const cur = latest?.price_usd ?? (candles.length ? candles[candles.length - 1].c : null);
  const fromAth = ath && cur ? ((cur - ath) / ath) * 100 : null;
  const roi = p.raise_price && cur ? ((cur - p.raise_price) / p.raise_price) * 100 : null;
  const holders = holderHistory.filter((h) => h.holder_count != null);
  const holderCount = holders.length ? holders[holders.length - 1].holder_count : null;
  const holderPct = holders.length >= 2 && holders[0].holder_count
    ? ((holders[holders.length - 1].holder_count! - holders[0].holder_count!) / holders[0].holder_count!) * 100
    : null;
  const liqRatio = latest?.liquidity_usd && latest.mcap ? latest.liquidity_usd / latest.mcap : null;
  const treasuryVsMcap = treasuryValue && latest?.mcap ? treasuryValue / latest.mcap : null;
  const oversub = p.raise_committed_usd && p.raise_amount_usd && p.raise_amount_usd > 0
    ? p.raise_committed_usd / p.raise_amount_usd : null;

  // ---- summary
  const parts: string[] = [];
  parts.push(
    `${p.name}${p.symbol ? ` (${p.symbol})` : ""} is a ${p.category ?? "MetaDAO ecosystem"} project` +
    (p.raise_amount_usd != null && p.raise_amount_usd > 0
      ? ` that raised ${fmtUsd(p.raise_amount_usd)}${p.raise_price ? ` at ${fmtUsd(p.raise_price, { compact: false })} per token` : ""}`
      : p.raise_note ? "" : " on the MetaDAO launchpad") + "."
  );
  if (latest?.mcap) {
    parts.push(`It trades at ${fmtUsd(cur, { compact: false })} for a ${fmtUsd(latest.mcap)} market cap on ${fmtUsd(latest.liquidity_usd)} of liquidity.`);
  }
  if (roi != null) {
    parts.push(`That is ${fmtPct(roi)} against the raise price.`);
  }
  if (hs.overall != null) {
    parts.push(`Its composite health score is ${hs.overall}/100 across ${hs.measured} measured dimensions.`);
  }
  const summary = parts.join(" ");

  // ---- bull / bear
  const bull: string[] = [];
  const bear: string[] = [];
  const risks: string[] = [];
  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (treasuryVsMcap != null && treasuryVsMcap > 0.3) {
    bull.push(`The treasury holds ${fmtUsd(treasuryValue)}, equal to ${(treasuryVsMcap * 100).toFixed(0)}% of market cap — a hard asset floor unusual at this size.`);
    strengths.push("Treasury backing is large relative to valuation.");
  }
  if (treasuryValue != null && p.raise_amount_usd && p.raise_amount_usd > 0) {
    const kept = treasuryValue / p.raise_amount_usd;
    if (kept > 0.7) strengths.push(`Capital discipline: ${(kept * 100).toFixed(0)}% of the raise is still held.`);
    if (kept < 0.2) {
      bear.push(`Only ${(kept * 100).toFixed(0)}% of the raised capital remains in the treasury.`);
      risks.push("Treasury depletion — runway may be limited without new revenue or funding.");
    }
  }
  if (oversub != null && oversub >= 5) {
    bull.push(`The raise was ${oversub >= 10 ? Math.round(oversub) : oversub.toFixed(1)}× oversubscribed (${fmtUsd(p.raise_committed_usd)} committed), evidence of strong initial demand.`);
  }
  if (holderPct != null && holderPct > 3) {
    bull.push(`The holder base grew ${holderPct.toFixed(1)}% over the tracked window to ${fmtNum(holderCount)} wallets.`);
    strengths.push("Distribution is widening rather than concentrating.");
  }
  if (holderPct != null && holderPct < -3) {
    bear.push(`The holder base contracted ${Math.abs(holderPct).toFixed(1)}% over the tracked window.`);
    weaknesses.push("Net holder attrition.");
  }
  if (liqRatio != null && liqRatio > 0.12) {
    strengths.push(`Deep secondary market — liquidity is ${(liqRatio * 100).toFixed(0)}% of market cap.`);
  }
  if (liqRatio != null && liqRatio < 0.03) {
    weaknesses.push(`Thin liquidity at ${(liqRatio * 100).toFixed(1)}% of market cap.`);
    risks.push("Low liquidity means exiting a position of size would move the price materially.");
  }
  if (github?.last_push_ts) {
    const days = (Date.now() / 1000 - github.last_push_ts) / 86400;
    if (days < 7) {
      bull.push(`Development is active — the team pushed code ${days < 1 ? "today" : `${Math.round(days)} days ago`} across ${github.repos ?? "several"} public repositories.`);
      strengths.push("Verifiable, ongoing engineering output.");
    } else if (days > 60) {
      bear.push(`No public commits in ${Math.round(days)} days.`);
      weaknesses.push("Public development appears stalled.");
      risks.push("Execution risk — public repositories show no recent activity.");
    }
  } else {
    weaknesses.push("No public GitHub organisation is linked, so engineering output cannot be verified.");
  }
  if (fromAth != null && fromAth < -60) {
    bear.push(`The token is ${fmtPct(fromAth)} from its all-time high.`);
  }
  if (fromAth != null && fromAth > -15 && candles.length > 20) {
    bull.push("Price is holding near its all-time high, indicating sustained bid support.");
  }
  if (roi != null && roi > 0) {
    strengths.push(`Raise participants are up ${fmtPct(roi)}.`);
  } else if (roi != null && roi < -25) {
    weaknesses.push(`Raise participants are down ${fmtPct(roi)}.`);
  }
  if (proposals.length === 0) {
    risks.push("No governance proposals are indexed, so treasury oversight cannot be assessed here.");
  }
  if (p.team_package && p.total_supply) {
    const lockPct = (p.team_package / p.total_supply) * 100;
    if (lockPct > 25) {
      risks.push(`${lockPct.toFixed(0)}% of supply sits in a locked team package; future unlocks are potential sell pressure.`);
    }
  }
  if (latest?.mcap != null && latest.mcap < 250_000) {
    risks.push("Micro-cap valuation — price is highly sensitive to individual trades.");
  }

  // ---- momentum
  let momentum = "Insufficient price history to assess momentum.";
  if (candles.length >= 8) {
    const win = candles.slice(-30);
    const chg = win[0].c > 0 ? ((candles[candles.length - 1].c - win[0].c) / win[0].c) * 100 : 0;
    const v7 = candles.slice(-7).reduce((s, c) => s + c.v, 0);
    const p7 = candles.slice(-14, -7).reduce((s, c) => s + c.v, 0);
    const volPhrase = p7 > 0
      ? ` Weekly volume is ${v7 >= p7 ? "up" : "down"} ${Math.abs((v7 / p7 - 1) * 100).toFixed(0)}% week-over-week.`
      : "";
    momentum = `Over the last ${win.length} sessions the price is ${fmtPct(chg)}.${volPhrase}` +
      (fromAth != null ? ` It sits ${fmtPct(fromAth)} from its all-time high.` : "");
  }

  // ---- recent developments (real indexed events)
  const developments = events.slice(0, 6).map((e) => {
    const date = new Date(e.ts * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    return `${date} — ${e.title}${e.detail ? ` (${e.detail})` : ""}`;
  });

  const competition = p.category
    ? `${p.name} competes within the ${p.category} category. Peer comparison across the MetaDAO cohort is available in the screener, where raise size, ROI, liquidity and holder growth can be ranked side by side.`
    : "No category has been assigned, so an automated peer set is not defined. Use the screener to compare against the full MetaDAO cohort.";

  // ---- outlook
  const outlookBits: string[] = [];
  if (hs.overall != null) {
    outlookBits.push(
      hs.overall >= 70
        ? `The measured fundamentals are strong (${hs.overall}/100).`
        : hs.overall >= 45
          ? `The measured fundamentals are mixed (${hs.overall}/100).`
          : `The measured fundamentals are weak (${hs.overall}/100).`
    );
  }
  if (treasuryVsMcap != null && treasuryVsMcap > 0.3) {
    outlookBits.push("A treasury of this size relative to market cap gives the team time to execute regardless of near-term price.");
  }
  if (hs.measured < hs.total) {
    outlookBits.push(`${hs.total - hs.measured} of ${hs.total} dimensions could not be measured from public sources, so this reading is partial.`);
  }
  const outlook = outlookBits.join(" ") || "Not enough data for a long-term view.";

  if (p.raise_note) risks.push(`Raise context: ${p.raise_note}`);

  return {
    summary,
    bull: bull.length ? bull : ["No positive signals rise above the noise in the currently indexed data."],
    bear: bear.length ? bear : ["No specific negative signals detected in the currently indexed data."],
    risks: risks.length ? risks : ["No structural risks flagged from the indexed metrics."],
    strengths, weaknesses, competition, developments, momentum, outlook,
  };
}
