"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ArrowUp, ArrowDown, X } from "lucide-react";

export interface Column<T> {
  key: string;
  header: string;
  /** Value used for search + sort (and default display). */
  value: (row: T) => string | number | null;
  /** Optional custom cell rendering. */
  render?: (row: T) => React.ReactNode;
  sortable?: boolean;
  mono?: boolean;
  width?: number;
}

export interface FilterDef<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  predicate: (row: T, value: string) => boolean;
}

const ALL = "__all__";

export function DataTable<T>({
  rows,
  columns,
  rowId,
  filters = [],
  searchPlaceholder = "Search…",
  emptyMessage = "No rows.",
  toolbar,
  actions,
}: {
  rows: T[];
  columns: Column<T>[];
  rowId: (row: T) => string;
  filters?: FilterDef<T>[];
  searchPlaceholder?: string;
  emptyMessage?: string;
  /** Right-aligned controls (e.g. a Create button). */
  toolbar?: React.ReactNode;
  /** Trailing per-row actions cell (e.g. edit/delete). Does not trigger row selection. */
  actions?: (row: T) => React.ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [filterValues, setFilterValues] = useState<Record<string, string>>({});
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // filter → search → sort
  const displayed = useMemo(() => {
    let r = rows;
    for (const f of filters) {
      const v = filterValues[f.key];
      if (v && v !== ALL) r = r.filter((row) => f.predicate(row, v));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      r = r.filter((row) =>
        columns.some((c) => {
          const val = c.value(row);
          return val != null && String(val).toLowerCase().includes(q);
        }),
      );
    }
    if (sortKey) {
      const col = columns.find((c) => c.key === sortKey);
      if (col) {
        r = [...r].sort((a, b) => {
          const av = col.value(a);
          const bv = col.value(b);
          if (av == null && bv == null) return 0;
          if (av == null) return 1;
          if (bv == null) return -1;
          const cmp =
            typeof av === "number" && typeof bv === "number"
              ? av - bv
              : String(av).localeCompare(String(bv), undefined, { numeric: true });
          return sortDir === "asc" ? cmp : -cmp;
        });
      }
    }
    return r;
  }, [rows, columns, filters, filterValues, query, sortKey, sortDir]);

  const displayedIds = useMemo(() => displayed.map(rowId), [displayed, rowId]);

  // ── selection ────────────────────────────────────────────────────────────────
  const anchorRef = useRef<number | null>(null);
  const draggingRef = useRef(false);
  const dragAdditiveRef = useRef(false);
  const dragBaseRef = useRef<Set<string>>(new Set());
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const end = () => {
      draggingRef.current = false;
      setIsDragging(false);
    };
    window.addEventListener("mouseup", end);
    return () => window.removeEventListener("mouseup", end);
  }, []);

  const allSelected = displayedIds.length > 0 && displayedIds.every((id) => selected.has(id));
  const someSelected = displayedIds.some((id) => selected.has(id));

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) displayedIds.forEach((id) => next.delete(id));
      else displayedIds.forEach((id) => next.add(id));
      return next;
    });

  const toggleOne = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const id = displayedIds[index];
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setRange = (from: number, to: number, base: Set<string>) => {
    const [lo, hi] = from <= to ? [from, to] : [to, from];
    const next = new Set(base);
    for (let i = lo; i <= hi; i++) next.add(displayedIds[i]);
    setSelected(next);
  };

  // All selection logic happens on mousedown so it composes with drag.
  const onRowMouseDown = (e: React.MouseEvent, index: number) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    setIsDragging(true);

    if (e.shiftKey && anchorRef.current != null) {
      dragAdditiveRef.current = false;
      dragBaseRef.current = new Set();
      setRange(anchorRef.current, index, new Set());
      return; // keep existing anchor for continued range
    }

    if (e.ctrlKey || e.metaKey) {
      toggleOne(index);
      anchorRef.current = index;
      dragAdditiveRef.current = true;
      const base = new Set(selected);
      const id = displayedIds[index];
      if (base.has(id)) base.delete(id);
      else base.add(id);
      dragBaseRef.current = base;
      return;
    }

    anchorRef.current = index;
    dragAdditiveRef.current = false;
    dragBaseRef.current = new Set();
    setSelected(new Set([displayedIds[index]]));
  };

  const onRowMouseEnter = (index: number) => {
    if (!draggingRef.current || anchorRef.current == null) return;
    setRange(anchorRef.current, index, dragAdditiveRef.current ? dragBaseRef.current : new Set());
  };

  const selectedCount = selected.size;
  const colSpan = columns.length + 1 + (actions ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-[10px] top-1/2 -translate-y-1/2 text-[var(--qz-fg-4)]"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="rounded-md pl-8 pr-3 py-[7px] text-[13px] text-[var(--qz-fg-1)] outline-none w-[240px]"
            style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" }}
            onFocus={(e) => (e.currentTarget.style.borderColor = "var(--qz-accent)")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "var(--qz-border)")}
          />
        </div>

        {filters.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            <span className="text-[12px] text-[var(--qz-fg-4)]">{f.label}</span>
            <select
              value={filterValues[f.key] ?? ALL}
              onChange={(e) => setFilterValues((p) => ({ ...p, [f.key]: e.target.value }))}
              className="rounded-md px-2 py-[7px] text-[13px] text-[var(--qz-fg-1)] outline-none cursor-pointer"
              style={{ background: "var(--qz-input-bg)", border: "1px solid var(--qz-border)" }}
            >
              <option value={ALL}>All</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-3">
          {toolbar}
          <span className="text-[12px] text-[var(--qz-fg-4)]">
            {displayed.length} {displayed.length === 1 ? "row" : "rows"}
          </span>
        </div>
      </div>

      {/* Selection bar */}
      {selectedCount > 0 && (
        <div
          className="flex items-center gap-3 px-3 py-2 rounded-md"
          style={{ background: "var(--qz-accent-soft)", border: "1px solid color-mix(in oklab, var(--qz-accent) 30%, transparent)" }}
        >
          <span className="text-[13px] font-medium text-[var(--qz-fg-1)]">
            {selectedCount} selected
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="flex items-center gap-[5px] text-[12px] text-[var(--qz-fg-3)] hover:text-[var(--qz-fg-1)] transition-colors cursor-pointer bg-transparent border-0 p-0 ml-auto"
          >
            <X size={13} /> Clear
          </button>
        </div>
      )}

      {/* Table */}
      <div
        className="rounded-md overflow-hidden"
        style={{
          border: "1px solid var(--qz-border)",
          userSelect: isDragging ? "none" : "auto",
        }}
      >
        <table className="qz-table">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleAll}
                  className="qz-check"
                  aria-label="Select all"
                />
              </th>
              {columns.map((c) => (
                <th
                  key={c.key}
                  style={{ width: c.width, cursor: c.sortable ? "pointer" : "default" }}
                  onClick={() => {
                    if (!c.sortable) return;
                    if (sortKey === c.key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                    else {
                      setSortKey(c.key);
                      setSortDir("asc");
                    }
                  }}
                >
                  <span className="inline-flex items-center gap-1">
                    {c.header}
                    {sortKey === c.key &&
                      (sortDir === "asc" ? <ArrowUp size={11} /> : <ArrowDown size={11} />)}
                  </span>
                </th>
              ))}
              {actions && <th style={{ width: 90 }} className="text-right">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {displayed.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="text-center text-[var(--qz-fg-4)]" style={{ cursor: "default" }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              displayed.map((row, index) => {
                const id = displayedIds[index];
                const isSel = selected.has(id);
                return (
                  <tr
                    key={id}
                    className={isSel ? "selected" : ""}
                    onMouseDown={(e) => onRowMouseDown(e, index)}
                    onMouseEnter={() => onRowMouseEnter(index)}
                  >
                    <td onMouseDown={(e) => e.stopPropagation()} style={{ cursor: "default" }}>
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleOne(index)}
                        className="qz-check"
                        aria-label="Select row"
                      />
                    </td>
                    {columns.map((c) => (
                      <td key={c.key} className={c.mono ? "mono" : undefined}>
                        {c.render ? c.render(row) : (c.value(row) ?? "—")}
                      </td>
                    ))}
                    {actions && (
                      <td
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{ cursor: "default" }}
                        className="text-right"
                      >
                        {actions(row)}
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
