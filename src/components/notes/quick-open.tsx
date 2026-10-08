import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { findQueryHit, firstLineTitle, matchesQuery, queueEditorReveal, snippetFromContent } from "@/lib/notes/format";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type QuickOpenProps = {
  open: boolean;
  notes: Note[];
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
};

const QUERY_CAP = 80;
const RECENT_CAP = 36;

export function QuickOpen({ open, notes, onOpenChange, onSelect }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const result = useMemo(() => {
    const q = query.trim();
    if (!q) {
      const recent = [...notes].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, RECENT_CAP);
      return {
        rows: recent.map((note) => ({ note, line: "" })),
        more: Math.max(0, notes.length - recent.length),
      };
    }
    const found: Note[] = [];
    for (const note of notes) {
      if (!matchesQuery(note, q)) continue;
      found.push(note);
    }
    return {
      rows: found.slice(0, QUERY_CAP).map((note) => ({
        note,
        line: findQueryHit(note.content, q)?.line ?? "",
      })),
      more: Math.max(0, found.length - QUERY_CAP),
    };
  }, [notes, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  if (!open) return null;

  function choose(note: Note) {
    const q = query.trim();
    if (q) {
      const hit = findQueryHit(note.content, q);
      if (hit) queueEditorReveal(note.id, hit.offset, hit.offset + q.length);
    }
    onSelect(note.id);
    onOpenChange(false);
  }

  const matches = result.rows;

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 pt-[12vh]"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="快速打开"
        className="dialog-content w-full max-w-md rounded-xl bg-bg p-3 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setIndex((value) => Math.min(matches.length - 1, value + 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setIndex((value) => Math.max(0, value - 1));
          }
          if (event.key === "Enter" && matches[index]) {
            event.preventDefault();
            choose(matches[index].note);
          }
          if (event.key === "Escape") onOpenChange(false);
        }}
      >
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="打开笔记…"
          aria-label="搜索笔记"
        />
        <ul className="mt-2 max-h-80 overflow-y-auto">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">没有匹配的笔记</li>
          ) : (
            matches.map((row, i) => (
              <li key={row.note.id}>
                <button
                  type="button"
                  className={cn(
                    "btn-press flex min-h-11 w-full flex-col items-start rounded-md px-3 py-2 text-left",
                    i === index ? "bg-overlay" : "hover:bg-overlay",
                  )}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(row.note)}
                >
                  <span className="font-serif text-sm">{firstLineTitle(row.note.content)}</span>
                  <span className="text-xs text-subtle">
                    {row.line
                      ? row.line
                      : `${row.note.bookTitle ? `${row.note.bookTitle} · ` : ""}${snippetFromContent(row.note.content)}`}
                  </span>
                </button>
              </li>
            ))
          )}
          {result.more > 0 ? (
            <li className="px-3 py-2 text-xs text-muted">还有 {result.more} 篇</li>
          ) : null}
        </ul>
      </div>
    </div>
  );
}
