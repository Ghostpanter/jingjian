import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  List,
  Minus,
  Pause,
  Pencil,
  Plus,
  Volume2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EditorPane } from "@/components/notes/editor-pane";
import { PreviewPane } from "@/components/notes/preview-pane";
import { titleFromContent } from "@/lib/notes/format";
import { writeReaderSession } from "@/lib/notes/reader-progress";
import { createTtsController, readTtsRate, speakableBlocks } from "@/lib/notes/reader-tts";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const FONT_KEY = "jingjian.reader.font.v1";
const RATE_STEPS = [0.8, 0.92, 1.05, 1.2];

type ReaderViewProps = {
  notes: Note[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
  onChange: (id: string, content: string) => void;
  onAddChapter?: () => void;
  onProgress: (id: string, ratio: number) => void;
  onExcerpt: (quote: string) => void;
};

export function ReaderView({
  notes,
  activeId,
  onSelect,
  onClose,
  onChange,
  onAddChapter,
  onProgress,
  onExcerpt,
}: ReaderViewProps) {
  const current = notes.find((note) => note.id === activeId) ?? notes[0];
  const [editing, setEditing] = useState(false);
  const [tocOpen, setTocOpen] = useState(false);
  const [fontScale, setFontScale] = useState(() => {
    if (typeof localStorage === "undefined") return 1;
    const raw = Number(localStorage.getItem(FONT_KEY));
    return Number.isFinite(raw) && raw >= 0.85 && raw <= 1.45 ? raw : 1;
  });
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [speakIndex, setSpeakIndex] = useState(-1);
  const [ttsRate, setTtsRate] = useState(readTtsRate);
  const [excerpt, setExcerpt] = useState<{ text: string; x: number; y: number } | null>(null);
  const [ratio, setRatio] = useState(current?.readRatio ?? 0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const progressTimer = useRef(0);
  const ratioRef = useRef(current?.readRatio ?? 0);
  const ttsRef = useRef<ReturnType<typeof createTtsController> | null>(null);

  useEffect(() => {
    localStorage.setItem(FONT_KEY, String(fontScale));
  }, [fontScale]);

  useEffect(() => {
    const controller = createTtsController({
      onIndex: (index) => setSpeakIndex(index),
      onEnd: () => {
        setSpeaking(false);
        setPaused(false);
        setSpeakIndex(-1);
      },
      onError: (message) => {
        toast.message(message);
        setSpeaking(false);
        setPaused(false);
      },
    });
    ttsRef.current = controller;
    return () => controller.dispose();
  }, []);

  useEffect(() => {
    setEditing(false);
    setTocOpen(false);
    setExcerpt(null);
    ttsRef.current?.stop();
    ratioRef.current = current?.readRatio ?? 0;
    setRatio(current?.readRatio ?? 0);
    if (!current?.bookId) return;
    onProgress(current.id, current.readRatio ?? 0);
    writeReaderSession({
      bookId: current.bookId,
      noteId: current.id,
      readerOpen: true,
      ratio: current.readRatio ?? 0,
      at: Date.now(),
    });
  }, [current?.id]);

  useEffect(() => {
    if (editing || !current?.bookId) return;
    function onSel() {
      const sel = window.getSelection();
      const text = sel?.toString().trim() ?? "";
      if (text.length < 2) {
        setExcerpt(null);
        return;
      }
      if (!sel || sel.rangeCount === 0) return;
      const rect = sel.getRangeAt(0).getBoundingClientRect();
      setExcerpt({
        text,
        x: rect.left + rect.width / 2,
        y: Math.max(12, rect.top - 8),
      });
    }
    document.addEventListener("selectionchange", onSel);
    return () => document.removeEventListener("selectionchange", onSel);
  }, [editing, current?.id, current?.bookId]);

  if (!current) return null;
  const index = Math.max(0, notes.findIndex((note) => note.id === current.id));
  const prev = notes[index - 1];
  const next = notes[index + 1];
  const bookTitle = current.bookTitle || titleFromContent(current.content);
  const chapterTitle = titleFromContent(current.content);
  const ebook = Boolean(current.bookId);
  const progress =
    notes.length > 0 ? ((index + ratio) / notes.length) * 100 : 0;

  function persistRatio(value: number) {
    ratioRef.current = value;
    if (progressTimer.current) window.clearTimeout(progressTimer.current);
    progressTimer.current = window.setTimeout(() => {
      setRatio(value);
      onProgress(current.id, value);
      if (current.bookId) {
        writeReaderSession({
          bookId: current.bookId,
          noteId: current.id,
          readerOpen: true,
          ratio: value,
          at: Date.now(),
        });
      }
    }, 360);
  }

  function go(note?: Note) {
    if (note) onSelect(note.id);
  }

  function closeReader() {
    ttsRef.current?.dispose();
    if (current.bookId) {
      writeReaderSession({
        bookId: current.bookId,
        noteId: current.id,
        readerOpen: false,
        ratio: ratioRef.current,
        at: Date.now(),
      });
    }
    onClose();
  }

  function handleTts() {
    const controller = ttsRef.current;
    if (!controller || !ebook) return;
    if (controller.playing && controller.paused) {
      controller.resume();
      setPaused(false);
      setSpeaking(true);
      return;
    }
    if (controller.playing) {
      controller.pause();
      setPaused(true);
      return;
    }
    const root = document.querySelector(".reader-scroll .md-body");
    const scroller = document.querySelector(".reader-scroll");
    const blocks = speakableBlocks(root);
    let from = 0;
    if (root && scroller) {
      const top = scroller.getBoundingClientRect().top;
      const found = [...root.children].findIndex(
        (node) => node.getBoundingClientRect().bottom > top + 24,
      );
      if (found >= 0) from = found;
    }
    setSpeaking(true);
    setPaused(false);
    controller.start(blocks, from);
  }

  function cycleRate() {
    const controller = ttsRef.current;
    const at = RATE_STEPS.findIndex((step) => Math.abs(step - ttsRate) < 0.02);
    const nextRate = RATE_STEPS[(at + 1) % RATE_STEPS.length];
    controller?.setRate(nextRate);
    setTtsRate(nextRate);
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
        <Button variant="ghost" size="icon-sm" aria-label="关闭阅读" onClick={closeReader}>
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
            {index + 1} / {notes.length} · {chapterTitle}
            {current.bookAuthor ? ` · ${current.bookAuthor}` : ""}
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
            <PreviewPane
              key={current.id}
              content={current.content}
              format={current.format}
              reader
              restoreRatio={current.readRatio ?? 0}
              speakIndex={speakIndex}
              onScrollRatio={persistRatio}
            />
          )}
        </div>
        {excerpt ? (
          <button
            type="button"
            className="reader-excerpt"
            style={{ left: excerpt.x, top: excerpt.y }}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onExcerpt(excerpt.text);
              window.getSelection()?.removeAllRanges();
              setExcerpt(null);
            }}
          >
            摘录
          </button>
        ) : null}
      </div>
      <footer className="reader-nav">
        <Button variant="subtle" disabled={!prev} onClick={() => go(prev)}>
          <ChevronLeft />
          上一章
        </Button>
        {ebook && !editing ? (
          <div className="reader-tts">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={speaking && !paused ? "暂停朗读" : "朗读"}
              aria-pressed={speaking && !paused}
              onClick={handleTts}
            >
              {speaking && !paused ? <Pause /> : <Volume2 />}
            </Button>
            <button
              type="button"
              className="reader-tts-rate"
              aria-label="朗读速度"
              onClick={cycleRate}
            >
              {ttsRate.toFixed(2).replace(/0$/, "")}×
            </button>
          </div>
        ) : (
          <span />
        )}
        <Button variant="subtle" disabled={!next} onClick={() => go(next)}>
          下一章
          <ChevronRight />
        </Button>
      </footer>
    </div>
  );
}
