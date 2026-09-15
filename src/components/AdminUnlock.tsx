"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The passphrase step in front of the review desk. The wallet is already
 * proven by the time this renders; this is the second factor. On success
 * the server sets the unlock cookie and the page re-renders with the queue.
 */
export function AdminUnlock({ configured }: { configured: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not unlock.");
      setPassword("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (!configured) {
    return (
      <div className="card p-6 text-[13px] leading-6 text-ink2">
        <div className="font-semibold text-warn">Review desk locked</div>
        <code className="text-ink">ADMIN_PASSWORD</code> is not set on this
        deployment, or is shorter than 16 characters. Set a strong passphrase
        and restart; nothing can be approved until then.
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card max-w-md space-y-4 p-6">
      <div>
        <div className="text-[14px] font-semibold text-ink">Admin passphrase</div>
        <p className="mt-1 text-[12.5px] leading-5 text-muted">
          Your wallet is on the admin list. Approving a listing also needs the
          shared passphrase; the unlock lasts an hour for this wallet.
        </p>
      </div>
      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Passphrase"
        required
        autoFocus
        className="w-full rounded-xl border border-line2 bg-surface2 px-3 py-2.5 text-[13px] text-ink outline-none placeholder:text-faint focus:border-accent"
      />
      {error && <div className="text-[12.5px] text-bad">{error}</div>}
      <button type="submit" disabled={busy || !password} className="btn-primary disabled:opacity-50">
        {busy ? "Checking…" : "Unlock"}
      </button>
    </form>
  );
}

/** The matching lock button for the unlocked desk. */
export function AdminLock() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/admin/unlock", { method: "DELETE" });
        router.refresh();
      }}
      className="btn-ghost !px-3 !py-1.5 text-[12px]"
    >
      Lock
    </button>
  );
}
