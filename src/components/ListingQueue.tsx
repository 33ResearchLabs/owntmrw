"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ListingRequest } from "@/lib/listings";
import { fmtDate, fmtNum, fmtUsd, shortAddr } from "@/lib/format";

/**
 * The review surface. Everything shown was read at submit time and frozen
 * in the request — the reviewer is judging the submission, not a fresh
 * snapshot that may have moved. The one thing to compare by eye is the
 * typed name/symbol against the on-chain one, so a mismatch is highlighted.
 */

// Pinned-locale formatters from lib/format: this component server-renders,
// and a browser in another locale would otherwise hydrate different text.
const short = shortAddr;
const usd = (n: number | null | undefined) => fmtUsd(n, { compact: false });

const OWNERSHIP: Record<ListingRequest["ownership"], { tone: string; label: string }> = {
  mint_authority: { tone: "text-good border-good/40", label: "mint authority" },
  update_authority: { tone: "text-good border-good/40", label: "update authority" },
  unverified: { tone: "text-warn border-warn/40", label: "unverified" },
};

function Row({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-[12px]">
      <span className="text-faint">{label}</span>
      <span className={`text-right ${warn ? "text-warn" : "text-ink2"}`}>{value}</span>
    </div>
  );
}

function Ext({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (!href) return <span className="text-faint">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
      {children}
    </a>
  );
}

function Request({ r }: { r: ListingRequest }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const v = r.verification;
  const nameMismatch = !!v.metadata && v.metadata.name.toLowerCase() !== r.name.toLowerCase();
  const symbolMismatch = !!v.metadata && v.metadata.symbol.toUpperCase() !== r.symbol.toUpperCase();

  async function act(action: "approve" | "reject") {
    if (action === "reject" && !note.trim()) {
      setError("Give the submitter a reason.");
      return;
    }
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/admin/listings/${r.id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, note: note.trim() || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="card p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {r.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={r.image_url} alt="" className="h-7 w-7 rounded-full bg-surface2 object-cover" />
        )}
        <h3 className="text-[15px] font-semibold text-ink">{r.name}</h3>
        <span className="text-[13px] text-muted">${r.symbol}</span>
        <span className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${OWNERSHIP[r.ownership].tone}`}>
          {OWNERSHIP[r.ownership].label}
        </span>
        {r.category && <span className="text-[11px] text-ink2">{r.category}</span>}
        <span className="ml-auto text-[11px] text-faint">
          #{r.id} · {short(r.submitted_by)} · {fmtDate(r.created_ts)}
        </span>
      </div>

      {r.description && <p className="mt-3 text-[12.5px] leading-6 text-ink2">{r.description}</p>}

      <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">On-chain</div>
          <Row label="Mint" value={<span className="num">{r.mint}</span>} />
          <Row label="Program" value={v.mint.program} />
          <Row label="Supply" value={<span className="num">{fmtNum(v.mint.supply)}</span>} />
          <Row label="Mint authority" value={<span className="num">{v.mint.mintAuthority ? short(v.mint.mintAuthority) : "revoked"}</span>} />
          <Row label="Freeze authority" value={<span className="num">{v.mint.freezeAuthority ? short(v.mint.freezeAuthority) : "revoked"}</span>} warn={!!v.mint.freezeAuthority} />
          <Row label="Metadata name" value={v.metadata?.name || "—"} warn={nameMismatch} />
          <Row label="Metadata symbol" value={v.metadata?.symbol || "—"} warn={symbolMismatch} />
          <Row label="Update authority" value={<span className="num">{v.metadata ? short(v.metadata.updateAuthority) : "—"}</span>} />
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Market &amp; risk</div>
          <Row label="Pool" value={v.market ? <Ext href={`https://dexscreener.com/solana/${v.market.pairAddress}`}>{v.market.dex} / {v.market.quoteSymbol}</Ext> : "none — will list as unlaunched"} warn={!v.market} />
          <Row label="Liquidity" value={usd(v.market?.liquidityUsd)} warn={!!v.market && (v.market.liquidityUsd ?? 0) < 10_000} />
          <Row label="24h volume" value={usd(v.market?.vol24h)} />
          <Row label="FDV" value={usd(v.market?.fdv)} />
          <Row label="RugCheck" value={v.risk ? `${v.risk.score ?? "—"}/100${v.risk.rugged ? " · RUGGED" : ""}` : "—"} warn={!!v.risk?.rugged} />
          {v.risk && v.risk.risks.length > 0 && (
            <Row
              label="Flags"
              value={v.risk.risks.map((f) => `${f.name} (${f.level})`).join(", ")}
              warn={v.risk.risks.some((f) => f.level === "danger")}
            />
          )}
          <Row label="Top 10 hold" value={v.risk?.top10Pct != null ? `${v.risk.top10Pct.toFixed(1)}%` : "—"} />
          <Row label="Website names mint" value={v.websiteNamesMint == null ? "not checked" : v.websiteNamesMint ? "yes" : "no"} warn={v.websiteNamesMint === false} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
        <Ext href={r.website}>Website</Ext>
        <Ext href={r.twitter}>X</Ext>
        <Ext href={r.discord}>Discord</Ext>
        <Ext href={r.telegram}>Telegram</Ext>
        <Ext href={r.github}>GitHub</Ext>
        <Ext href={r.docs}>Docs</Ext>
        {r.proof_url && (
          <span className="text-warn">
            Proof: <Ext href={r.proof_url}>{r.proof_url}</Ext>
          </span>
        )}
        <Ext href={`https://solscan.io/token/${r.mint}${v.cluster !== "mainnet" ? `?cluster=${v.cluster}` : ""}`}>Solscan</Ext>
      </div>

      {r.status === "pending" ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note to the submitter (required to reject)"
            className="min-w-[240px] flex-1 rounded-xl border border-line2 bg-surface2 px-3 py-2 text-[12.5px] outline-none placeholder:text-faint focus:border-accent"
          />
          <button type="button" onClick={() => act("approve")} disabled={!!busy} className="btn-primary !py-2 disabled:opacity-50">
            {busy === "approve" ? "Approving…" : "Approve"}
          </button>
          <button type="button" onClick={() => act("reject")} disabled={!!busy} className="btn-ghost !py-2 text-bad disabled:opacity-50">
            {busy === "reject" ? "Rejecting…" : "Reject"}
          </button>
          {error && <span className="basis-full text-[12px] text-bad">{error}</span>}
        </div>
      ) : (
        <div className="mt-4 text-[12px] text-muted">
          {r.status} by {r.reviewed_by ? short(r.reviewed_by) : "—"}
          {r.reviewed_ts ? ` · ${fmtDate(r.reviewed_ts)}` : ""}
          {r.review_note ? ` · ${r.review_note}` : ""}
          {r.slug ? <> · <a href={`/project/${r.slug}`} className="text-accent hover:underline">/project/{r.slug}</a></> : null}
        </div>
      )}
    </li>
  );
}

export function ListingQueue({ requests }: { requests: ListingRequest[] }) {
  if (requests.length === 0) {
    return <div className="card p-6 text-[13px] text-muted">Nothing here.</div>;
  }
  return (
    <ul className="space-y-4">
      {requests.map((r) => <Request key={r.id} r={r} />)}
    </ul>
  );
}
