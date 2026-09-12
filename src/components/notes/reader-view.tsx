import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Minus,
  Pencil,
  Plus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorPane } from "@/components/notes/editor-pane";
import { PreviewPane } from "@/components/notes/preview-pane";
import { titleFromContent } from "@/lib/notes/format";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const FONT_KEY = "jingjian.reader.font.v1";

type ReaderViewProps = {
  notes: Note[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onChange: (id: string, content: string) => void;
  onAddChapter?: () => void;
};

export function ReaderView({
  notes,
  activeId,
  onSelect,
  onClose,
  onChange,
  onAddChapter,
}: ReaderViewProps) {
  const current = notes.find((note) => note.id === activeId) ?? notes[0];
  const [editing, setEditing] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [fontScale, setFontScale] = useState(() => {
    if (typeof localStorage === "undefined") return 1;
    const raw = Number(localStorage.getItem(FONT_KEY));
    return Number.isFinite(raw) && raw >= 0.85 && raw <= 1.45 ? raw : 1;
  });
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    setEditing(false);
    setTocOpen(false);
  }, [current?.id]);

  if (!current) return null;
  const index = Math.max(0, notes.findIndex((note) => note.id === current.id));
  const prev = notes[index - 1];
  const next = notes[index + 1];
  const bookTitle = current.bookTitle || titleFromContent(current.content);
  const progress = notes.length > 0 ? ((index + 1) / notes.length) * 100 : 0;

  function go(note?: Note) {
    if (note) onSelect(note.id);
  }

  function handlePagePointer(clientX: number, width: number, target: EventTarget | null) {
    if (editing) return;
    const selected = window.getSelection()?.toString();
    if (selected) return;
    const el = target instanceof HTMLElement ? target : null;
    if (el?.closest("a, button, textarea, input, img")) return;
    if (clientX < width * 0.28) go(prev);
    else if (clientX > width * 0.72) go(next);
  }

  return (
    <div className="reader-shell safe-shell">
      <header className="reader-toolbar">
        <Button variant="ghost" size="icon-sm" aria-label="关闭阅读" onClick={onClose}>
          <X />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="目录"
          aria-pressed={tocOpen}
          onClick={() => setTocOpen((open) => !open)}
        >
          <List />
        </Button>
        <div className="min-w-0 flex-1 px-2">
          <div className="truncate font-serif text-sm text-fg">{bookTitle}</div>
          <div className="truncate text-xs text-muted">
            {index + 1} / {notes.length} · {titleFromContent(current.content)}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="减小字号"
          onClick={() => setFontScale((value) => Math.max(0.85, Number((value - 0.08).toFixed(2))))}
        >
          <Minus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="增大字号"
          onClick={() => setFontScale((value) => Math.min(1.45, Number((value + 0.08).toFixed(2))))}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={editing ? "阅读本章" : "编辑本章"}
          aria-pressed={editing}
          onClick={() => setEditing((value) => !value)}
        >
          <Pencil />
        </Button>
      </header>
      <div className="reader-progress" aria-hidden>
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="relative min-h-0 flex-1">
        {tocOpen ? (
          <nav className="reader-toc" aria-label="章节目录">
            {notes.map((note, chapterIndex) => {
              const selected = note.id === current.id;
              return (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => {
                    onSelect(note.id);
                    setTocOpen(false);
                  }}
                  className={cn(
                    "btn-press flex w-full items-start gap-3 rounded-md px-3 py-3 text-left",
                    selected ? "bg-paper text-fg shadow-border" : "hover:bg-overlay",
                  )}
                >
                  <span className="w-6 shrink-0 text-xs tabular-nums text-subtle">
                    {chapterIndex + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {titleFromContent(note.content)}
                  </span>
                </button>
              );
            })}
            {onAddChapter ? (
              <button
                type="button"
                className="btn-press mt-2 w-full rounded-md px-3 py-3 text-left text-sm text-muted hover:bg-overlay"
                onClick={() => {
                  onAddChapter();
                  setTocOpen(false);
                  setEditing(true);
                }}
              >
                新建章节
              </button>
            ) : null}
          </nav>
        ) : null}
        <div
          className="h-full min-h-0"
          style={{ fontSize: `${fontScale}em` }}
          onClick={(event) => {
            if (tocOpen) {
              setTocOpen(false);
              return;
            }
            const rect = event.currentTarget.getBoundingClientRect();
            handlePagePointer(event.clientX - rect.left, rect.width, event.target);
          }}
          onTouchStart={(event) => {
            const touch = event.changedTouches[0];
            touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            touchStart.current = null;
            if (!start || editing) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = Math.abs(touch.clientY - start.y);
            if (Math.abs(dx) < 56 || dy > 72) return;
            if (dx > 0) go(prev);
            else go(next);
          }}
        >
          {editing ? (
            <EditorPane
              noteId={current.id}
              content={current.content}
              onChange={(value) => onChange(current.id, value)}
            />
          ) : (
            <PreviewPane content={current.content} format={current.format} reader />
          )}
        </div>
      </div>
      <footer className="reader-nav">
        <Button variant="subtle" disabled={!prev} onClick={() => go(prev)}>
          <ChevronLeft />
          上一章
        </Button>
        <Button variant="subtle" disabled={!next} onClick={() => go(next)}>
          下一章
          <ChevronRight />
        </Button>
      </footer>
    </div>
  );
}
