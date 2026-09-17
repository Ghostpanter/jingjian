import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { firstLineTitle, snippetFromContent } from "@/lib/notes/format";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type QuickOpenProps = {
  open: boolean;
  notes: Note[];
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
};

export function QuickOpen({ open, notes, onOpenChange, onSelect }: QuickOpenProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? notes.filter((note) => firstLineTitle(note.content).toLowerCase().includes(q))
      : notes;
    return list.slice(0, 12);
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

  function choose(id: string) {
    onSelect(id);
    onOpenChange(false);
  }

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
            choose(matches[index].id);
          }
          if (event.key === "Escape") onOpenChange(false);
        }}
      >
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="打开笔记…"
          aria-label="搜索标题"
        />
        <ul className="mt-2 max-h-80 overflow-y-auto">
          {matches.length === 0 ? (
            <li className="px-3 py-3 text-sm text-muted">没有匹配的笔记</li>
          ) : (
            matches.map((note, i) => (
              <li key={note.id}>
                <button
                  type="button"
                  className={cn(
                    "btn-press flex min-h-11 w-full flex-col items-start rounded-md px-3 py-2 text-left",
                    i === index ? "bg-overlay" : "hover:bg-overlay",
                  )}
                  onMouseEnter={() => setIndex(i)}
                  onClick={() => choose(note.id)}
                >
                  <span className="font-serif text-sm">{firstLineTitle(note.content)}</span>
                  <span className="text-xs text-subtle">{snippetFromContent(note.content)}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
