"use client";

import { Pencil, Trash2 } from "lucide-react";

/// Per-row edit/delete controls. Non-functional placeholders for now.
export function RowActions() {
  return (
    <div className="inline-flex items-center gap-1 justify-end">
      <button
        type="button"
        title="Edit"
        aria-label="Edit"
        className="grid place-items-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-accent)] hover:bg-[color-mix(in_oklab,white_5%,transparent)] transition-colors cursor-pointer"
      >
        <Pencil size={14} />
      </button>
      <button
        type="button"
        title="Delete"
        aria-label="Delete"
        className="grid place-items-center w-7 h-7 rounded-md bg-transparent border-0 text-[var(--qz-fg-4)] hover:text-[var(--qz-danger)] hover:bg-[color-mix(in_oklab,white_5%,transparent)] transition-colors cursor-pointer"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}
