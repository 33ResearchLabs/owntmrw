"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MintInfo, Ownership, TokenMetadata } from "@/lib/sources/listings";
import { fmtNum } from "@/lib/format";

/**
 * Two steps: paste the mint and learn what the chain calls it and whether
 * this wallet can prove ownership, then fill in the rest. Ownership decides
 * whether a public proof link is demanded — the server enforces the same
 * rule, this just asks up front instead of after a full form.
 */

interface Inspected {
  cluster: string;
  mint: MintInfo;
  metadata: TokenMetadata | null;
  ownership: Ownership;
}

const FIELD =
  "w-full rounded-xl border border-line2 bg-surface2 px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent";

const OWNERSHIP_COPY: Record<Ownership, { tone: string; text: string }> = {
  mint_authority: { tone: "text-good", text: "Verified — your wallet is the mint authority." },
  update_authority: { tone: "text-good", text: "Verified — your wallet is the metadata update authority." },
  unverified: {
    tone: "text-warn",
    text: "Your wallet is not an authority on this token. You can still submit, with a public proof link that names this mint.",
  },
};

function Field({
  label, hint, children,
}: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</span>
      {hint && <span className="ml-2 text-[11px] text-faint">{hint}</span>}
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

export function ListingForm({ categories }: { categories: readonly string[] }) {
  const router = useRouter();
  const [mint, setMint] = useState("");
  const [inspecting, setInspecting] = useState(false);
  const [inspected, setInspected] = useState<Inspected | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<number | null>(null);

  const [f, setF] = useState({
    name: "", symbol: "", description: "", category: "",
    website: "", twitter: "", discord: "", telegram: "",
    github: "", docs: "", image_url: "", proof_url: "",
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setF((s) => ({ ...s, [k]: e.target.value }));

  async function inspect() {
    setError(null);
    setInspecting(true);
    try {
      const res = await fetch("/api/listings/inspect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint: mint.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not read this mint.");
      const r = json as Inspected;
      setInspected(r);
      // Pre-fill from the chain; the creator can still correct it.
      setF((s) => ({
        ...s,
        name: s.name || r.metadata?.name || "",
        symbol: s.symbol || r.metadata?.symbol || "",
        image_url: s.image_url || r.metadata?.image || "",
      }));
    } catch (e) {
      setInspected(null);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInspecting(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!inspected) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mint: mint.trim(), ...f }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Submission failed.");
      setDone(json.id as number);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (done != null) {
    return (
      <div className="card p-6">
        <h3 className="text-[15px] font-semibold text-ink">Submitted for review</h3>
        <p className="mt-2 text-[13px] leading-6 text-ink2">
          Request #{done} is in the queue. Nothing is published until a reviewer
          checks it against what the chain says; you will see the outcome below
          on this page.
        </p>
      </div>
    );
  }

  const needsProof = inspected?.ownership === "unverified";

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Step 1 — the mint */}
      <div className="card p-5">
        <Field label="Token mint address" hint="the SPL mint, not a wallet or pool">
          <div className="flex gap-2">
            <input
              value={mint}
              onChange={(e) => { setMint(e.target.value); setInspected(null); }}
              placeholder="e.g. METAwkXcqyXKy1AtsSgJ8JiUHwGCafnZL38n3vYmeta"
              spellCheck={false}
              className={`${FIELD} num`}
            />
            <button
              type="button"
              onClick={inspect}
              disabled={inspecting || mint.trim().length < 32}
              className="btn-ghost shrink-0 !py-2 disabled:opacity-50"
            >
              {inspecting ? "Reading…" : "Check"}
            </button>
          </div>
        </Field>

        {inspected && (
          <div className="mt-4 rounded-xl border border-line bg-surface2 p-4 text-[12.5px]">
            <div className={`font-semibold ${OWNERSHIP_COPY[inspected.ownership].tone}`}>
              {OWNERSHIP_COPY[inspected.ownership].text}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-ink2 sm:grid-cols-3">
              <div><dt className="text-faint">On-chain name</dt><dd>{inspected.metadata?.name || "—"}</dd></div>
              <div><dt className="text-faint">Symbol</dt><dd>{inspected.metadata?.symbol || "—"}</dd></div>
              <div><dt className="text-faint">Program</dt><dd>{inspected.mint.program}</dd></div>
              <div><dt className="text-faint">Supply</dt><dd className="num">{fmtNum(inspected.mint.supply)}</dd></div>
              <div><dt className="text-faint">Mint authority</dt><dd className="num truncate">{inspected.mint.mintAuthority ?? "revoked"}</dd></div>
              <div><dt className="text-faint">Cluster</dt><dd>{inspected.cluster}</dd></div>
            </dl>
          </div>
        )}
      </div>

      {/* Step 2 — the profile */}
      {inspected && (
        <div className="card space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name">
              <input value={f.name} onChange={set("name")} maxLength={40} required className={FIELD} />
            </Field>
            <Field label="Symbol">
              <input value={f.symbol} onChange={set("symbol")} maxLength={10} required className={`${FIELD} uppercase`} />
            </Field>
          </div>
          <Field label="Description" hint="plain text, up to 600 characters">
            <textarea value={f.description} onChange={set("description")} maxLength={600} rows={4} className={FIELD} />
          </Field>
          <Field label="Category">
            <select value={f.category} onChange={set("category")} className={FIELD}>
              <option value="">—</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Website"><input value={f.website} onChange={set("website")} placeholder="https://" className={FIELD} /></Field>
            <Field label="X / Twitter"><input value={f.twitter} onChange={set("twitter")} placeholder="https://x.com/…" className={FIELD} /></Field>
            <Field label="Discord"><input value={f.discord} onChange={set("discord")} placeholder="https://discord.gg/…" className={FIELD} /></Field>
            <Field label="Telegram"><input value={f.telegram} onChange={set("telegram")} placeholder="https://t.me/…" className={FIELD} /></Field>
            <Field label="GitHub"><input value={f.github} onChange={set("github")} placeholder="https://github.com/…" className={FIELD} /></Field>
            <Field label="Docs"><input value={f.docs} onChange={set("docs")} placeholder="https://" className={FIELD} /></Field>
          </div>
          <Field label="Logo URL" hint="taken from the token metadata when left blank">
            <input value={f.image_url} onChange={set("image_url")} placeholder="https://" className={FIELD} />
          </Field>
          {needsProof && (
            <Field label="Proof link" hint="required — a public post or page from the project that names this mint">
              <input value={f.proof_url} onChange={set("proof_url")} placeholder="https://x.com/project/status/…" required className={FIELD} />
            </Field>
          )}

          <p className="text-[12px] leading-5 text-muted">
            Raise figures, supply split and treasury are not taken from
            submissions — they are read from public sources or left blank,
            so a listing cannot claim what it cannot show.
          </p>

          {error && <div className="text-[12.5px] text-bad">{error}</div>}

          <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50">
            {submitting ? "Verifying…" : "Submit for review"}
          </button>
        </div>
      )}

      {error && !inspected && <div className="text-[12.5px] text-bad">{error}</div>}
    </form>
  );
}
