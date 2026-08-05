"use client";

import { useEffect, useState } from "react";

/**
 * Copy a value to the clipboard.
 *
 * Addresses are the one thing on this page a reader needs verbatim — to paste
 * into an explorer, a wallet, or a spreadsheet — and selecting 44 base58
 * characters out of a table row by hand is error-prone in a way that matters:
 * a mistyped address is a different account, not a failed lookup.
 */
export function CopyButton({ value, label = "address" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <button
      type="button"
      // The row is a link to the wallet page; copying must not navigate.
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(
          () => setCopied(true),
          () => setCopied(false)
        );
      }}
      title={copied ? "Copied" : `Copy ${label}`}
      aria-label={copied ? "Copied" : `Copy ${label}`}
      className="inline-flex shrink-0 items-center rounded p-0.5 text-faint transition-colors hover:bg-surface2 hover:text-accent"
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--good)"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="9" y="9" width="11" height="11" rx="2" />
          <path d="M5 15V5a2 2 0 0 1 2-2h10" />
        </svg>
      )}
    </button>
  );
}
