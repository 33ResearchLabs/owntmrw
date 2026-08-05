"use client";

import { useState } from "react";

/**
 * Collapse the tail of a table behind a toggle.
 *
 * The rows arrive already rendered from the server component that owns the
 * table, so the cell markup stays in one place and this only holds the open
 * state. Everything is in the DOM either way — the count in the button says how
 * much is hidden, so a long tail never looks like the whole list.
 */
export function MoreRows({
  children,
  count,
  colSpan,
  noun,
}: {
  /** The rows to reveal. */
  children: React.ReactNode;
  /** How many rows those are — shown in the button. */
  count: number;
  colSpan: number;
  /** Plural noun for the button, e.g. "venues". */
  noun: string;
}) {
  const [open, setOpen] = useState(false);
  if (count <= 0) return null;

  return (
    <>
      {open && children}
      <tr>
        <td colSpan={colSpan} className="!p-0">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="w-full px-4 py-2.5 text-left text-[12px] text-accent transition-colors hover:bg-surface2"
          >
            {open ? `Show fewer ${noun}` : `Show ${count} more ${noun}`}
            <span className="ml-1.5 text-[9px] align-[1px]">{open ? "▲" : "▼"}</span>
          </button>
        </td>
      </tr>
    </>
  );
}
