import type { ClipboardEvent, DragEvent } from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  indentLines,
  looksLikeUrl,
  normalizeHref,
  wrapAsMarkup,
} from "@/lib/notes/insert-markup";
import { insertImageAtCursor } from "@/lib/notes/image-insert";
import {
  editorSlice,
  editorSliceAround,
  EDITOR_SLICE_CHARS,
  EDITOR_WINDOW_CHARS,
  extendBounds,
  isLargeNote,
  peekPendingReveal,
} from "@/lib/notes/format";
import { paragraphAt, typewriterScroll } from "@/lib/notes/focus-text";
import { classifyIncoming } from "@/lib/notes/open-incoming";
import { cn } from "@/lib/utils";

type EditorPaneProps = {
  noteId: string;
  epoch?: number;
  content: string;
  centered?: boolean;
  focusMode?: boolean;
  onChange: (value: string) => void;
  onImportFiles?: (files: File[]) => void;
  onScroll?: () => void;
  onEditingChange?: (editing: boolean) => void;
};

export function EditorPane({
  noteId,
  epoch = 0,
  content,
  centered = true,
  focusMode = false,
  onChange,
  onImportFiles,
  onScroll,
  onEditingChange,
}: EditorPaneProps) {
  const large = isLargeNote(content);
  const mirrorCap = 80_000;
  const focusMirror = Boolean(focusMode) && content.length < mirrorCap;
  const focusScroll = Boolean(focusMode);
  const [cursor, setCursor] = useState(0);
  const [sliceTick, setSliceTick] = useState(0);
  const [windowRev, setWindowRev] = useState(0);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const probeRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(content);
  const bounds = useRef({ key: "", start: 0, end: 0 });
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const growing = useRef(false);
  const sliceKey = `${noteId}-${epoch}`;
  contentRef.current = content;
  if (bounds.current.key !== sliceKey) {
    const next = large ? editorSlice(content, 0) : { start: 0, end: content.length };
    bounds.current = { key: sliceKey, ...next };
  }
  const windowText = large
    ? content.slice(bounds.current.start, Math.min(content.length, bounds.current.end))
    : content;
  const range = paragraphAt(focusMirror ? content : windowText, cursor);

  function commit(nextWindow: string) {
    if (!large) {
      onChange(nextWindow);
      return;
    }
    const { start, end } = bounds.current;
    const full = contentRef.current.slice(0, start) + nextWindow + contentRef.current.slice(end);
    bounds.current.end = start + nextWindow.length;
    contentRef.current = full;
    onChange(full);
  }

  function moveSlice(dir: -1 | 1) {
    if (!large) return;
    const current = bounds.current;
    let anchor = dir < 0 ? Math.max(0, current.start - EDITOR_SLICE_CHARS) : current.end;
    if (dir < 0 && anchor > 0) {
      const nl = content.lastIndexOf("\n", anchor - 1);
      anchor = nl >= 0 ? nl + 1 : 0;
    }
    if (anchor >= content.length) return;
    const next = editorSlice(content, anchor);
    if (next.start === current.start && next.end === current.end) return;
    bounds.current = { key: sliceKey, ...next };
    setSliceTick((tick) => tick + 1);
  }

  function growWindow(el: HTMLTextAreaElement, dir: -1 | 1) {
    const full = contentRef.current;
    const prev = { start: bounds.current.start, end: bounds.current.end };
    const next = extendBounds(full.length, prev, dir, 16_000, EDITOR_WINDOW_CHARS);
    if (!next) return false;
    const selStart = el.selectionStart;
    const selEnd = el.selectionEnd;
    const delta = prev.start - next.start;
    bounds.current = { key: sliceKey, start: next.start, end: next.end };
    el.value = full.slice(next.start, next.end);
    el.dataset.sliceStart = String(next.start);
    const ratio = el.scrollHeight / Math.max(1, el.value.length);
    el.scrollTop = Math.max(0, el.scrollTop + delta * ratio);
    if (document.activeElement === el) {
      const from = Math.max(0, Math.min(el.value.length, selStart + delta));
      const to = Math.max(from, Math.min(el.value.length, selEnd + delta));
      el.setSelectionRange(from, to);
    }
    setWindowRev((rev) => rev + 1);
    return true;
  }

  function followScroll(el: HTMLTextAreaElement) {
    if (focusScroll || !isLargeNote(contentRef.current) || growing.current) return;
    const atTop = el.scrollTop <= 48 && bounds.current.start > 0;
    const atBottom =
      el.scrollTop + el.clientHeight >= el.scrollHeight - 64 &&
      bounds.current.end < contentRef.current.length;
    const dir = atTop ? -1 : atBottom ? 1 : 0;
    if (!dir) return;
    growing.current = true;
    requestAnimationFrame(() => {
      growing.current = false;
      const current = document.getElementById("note-editor");
      if (!(current instanceof HTMLTextAreaElement)) return;
      if (!growWindow(current, dir)) return;
      const stillTop = current.scrollTop <= 48 && bounds.current.start > 0;
      const stillBottom =
        current.scrollTop + current.clientHeight >= current.scrollHeight - 64 &&
        bounds.current.end < contentRef.current.length;
      if ((dir < 0 && stillTop) || (dir > 0 && stillBottom)) followScroll(current);
    });
  }

  function placeSelection(start: number, end: number) {
    const el = document.getElementById("note-editor");
    if (!(el instanceof HTMLTextAreaElement)) return;
    const active = document.activeElement;
    const from = Math.max(0, Math.min(start, el.value.length));
    const to = Math.max(from, Math.min(end, el.value.length));
    el.focus();
    el.setSelectionRange(from, to);
    const max = el.scrollHeight - el.clientHeight;
    if (max > 0) el.scrollTop = (from / Math.max(1, el.value.length)) * max;
    if (
      active instanceof HTMLElement &&
      active !== el &&
      (active.id === "note-find" || active.id === "note-replace")
    ) {
      active.focus();
    }
  }

  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<{ start?: number; end?: number; noteId?: string }>).detail;
      if (!detail || typeof detail.start !== "number") return;
      if (detail.noteId && detail.noteId !== noteId) return;
      const start = detail.start;
      const end = typeof detail.end === "number" ? detail.end : start;
      const full = contentRef.current;
      if (!isLargeNote(full)) {
        placeSelection(start, end);
        return;
      }
      const current = bounds.current;
      if (start >= current.start && end <= current.end) {
        placeSelection(start - current.start, end - current.start);
        return;
      }
      const next = editorSliceAround(full, start);
      bounds.current = { key: sliceKey, ...next };
      pendingSel.current = {
        start: Math.max(0, start - next.start),
        end: Math.max(0, end - next.start),
      };
      setSliceTick((tick) => tick + 1);
    };
    window.addEventListener("jingjian-reveal", onReveal);
    return () => window.removeEventListener("jingjian-reveal", onReveal);
  }, [sliceKey, noteId]);

  useLayoutEffect(() => {
    const pending = peekPendingReveal(noteId);
    if (!pending) return;
    const start = pending.start;
    const end = pending.end;
    const full = contentRef.current;
    if (!isLargeNote(full)) {
      placeSelection(start, end);
      return;
    }
    const next = editorSliceAround(full, start);
    bounds.current = { key: sliceKey, ...next };
    pendingSel.current = {
      start: Math.max(0, start - next.start),
      end: Math.max(0, end - next.start),
    };
    setSliceTick((tick) => tick + 1);
  }, [noteId, sliceKey]);

  useEffect(() => {
    const el = document.getElementById("note-editor");
    if (el instanceof HTMLTextAreaElement) el.dataset.sliceStart = String(bounds.current.start);
    const sel = pendingSel.current;
    if (!sel) return;
    pendingSel.current = null;
    placeSelection(sel.start, sel.end);
  }, [sliceTick, sliceKey, windowText]);

  useEffect(() => {
    if (!large) return;
    const el = document.getElementById("note-editor");
    if (!(el instanceof HTMLTextAreaElement)) return;
    const expected = content.slice(bounds.current.start, Math.min(content.length, bounds.current.end));
    if (el.value === expected) return;
    if (el.value === content || el.value.length > expected.length + 32) {
      const next = editorSlice(content, Math.min(bounds.current.start, content.length));
      bounds.current = { key: sliceKey, ...next };
      el.value = content.slice(next.start, next.end);
    }
  }, [content, large, sliceKey, sliceTick]);

  function syncMirror(el: HTMLTextAreaElement) {
    const inner = mirrorRef.current;
    if (!inner) return;
    inner.style.width = `${el.clientWidth}px`;
    inner.style.transform = `translateY(${-el.scrollTop}px)`;
  }

  function pinCaret(el: HTMLTextAreaElement) {
    if (!focusScroll || el.selectionStart !== el.selectionEnd) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const probe = probeRef.current;
    if (!probe) return;
    probe.style.width = `${el.clientWidth}px`;
    probe.textContent = "";
    const pos = el.selectionStart;
    const marker = document.createElement("span");
    marker.textContent = "\u200b";
    let top = 0;
    if (el.value.length < mirrorCap) {
      probe.append(document.createTextNode(el.value.slice(0, pos)));
      probe.append(marker);
      top = marker.offsetTop;
    } else {
      const para = paragraphAt(el.value, pos);
      let lines = 0;
      for (let index = 0; index < para.start; index += 1) {
        if (el.value.charCodeAt(index) === 10) lines += 1;
      }
      const lineHeight = Number.parseFloat(getComputedStyle(el).lineHeight) || 28;
      probe.append(document.createTextNode(el.value.slice(para.start, pos)));
      probe.append(marker);
      top = lines * lineHeight + marker.offsetTop;
    }
    const next = typewriterScroll(top, marker.offsetHeight || 24, el.clientHeight);
    if (Math.abs(el.scrollTop - next) > 4) el.scrollTop = next;
  }

  function trackCaret(el: HTMLTextAreaElement, pin: boolean) {
    if (!focusScroll) return;
    setCursor(el.selectionStart);
    requestAnimationFrame(() => {
      if (pin) pinCaret(el);
      if (focusMirror) syncMirror(el);
    });
  }

  useEffect(() => {
    if (!focusScroll) return;
    const el = document.getElementById("note-editor") as HTMLTextAreaElement | null;
    if (!el) return;
    setCursor(el.selectionStart);
    const frame = requestAnimationFrame(() => {
      pinCaret(el);
      if (focusMirror) syncMirror(el);
    });
    return () => cancelAnimationFrame(frame);
  }, [focusScroll, focusMirror]);

  async function insertFiles(
    el: HTMLTextAreaElement,
    files: File[],
  ) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    let value = el.value;
    let cursor = el.selectionStart;
    try {
      for (const file of images) {
        const next = await insertImageAtCursor(
          value,
          cursor,
          cursor,
          file,
          file.name,
        );
        value = next.value;
        cursor = next.cursor;
      }
      el.value = value;
      commit(value);
      requestAnimationFrame(() => el.setSelectionRange(cursor, cursor));
      toast.message(images.length > 1 ? `已插入 ${images.length} 张图片` : "已插入图片");
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "图片插入失败");
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    const files = [...event.clipboardData.files];
    if (files.some((file) => file.type.startsWith("image/"))) {
      event.preventDefault();
      void insertFiles(el, files);
      return;
    }
    const clip = event.clipboardData.getData("text/plain").trim();
    if (!looksLikeUrl(clip)) return;
    if (el.selectionStart === el.selectionEnd) return;
    event.preventDefault();
    const href = normalizeHref(clip);
    const next = wrapAsMarkup(
      el.value,
      el.selectionStart,
      el.selectionEnd,
      el.value.slice(el.selectionStart, el.selectionEnd),
      href,
      false,
    );
    el.value = next.value;
    commit(next.value);
    requestAnimationFrame(() => el.setSelectionRange(next.cursor, next.cursor));
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const files = [...event.dataTransfer.files];
    const images = files.filter((file) => {
      const kind = classifyIncoming(file.name, file.type);
      return kind === "image" || file.type.startsWith("image/");
    });
    const docs = files.filter((file) => {
      const kind = classifyIncoming(file.name, file.type);
      return kind === "markdown" || kind === "txt" || kind === "ebook";
    });
    if (images.length === 0 && docs.length === 0) return;
    event.preventDefault();
    if (images.length) void insertFiles(event.currentTarget, images);
    if (docs.length) onImportFiles?.(docs);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {large ? (
        <div className="note-clip-banner flex flex-wrap items-center justify-between gap-2" role="status" data-window={windowRev}>
          <p>文件较大，滚到边缘会继续展开这一段。</p>
          <span className="flex gap-2">
            <button
              type="button"
              className="btn-press rounded-md bg-paper px-2 py-1 text-fg disabled:opacity-40"
              disabled={bounds.current.start <= 0}
              onClick={() => moveSlice(-1)}
            >
              上一段
            </button>
            <button
              type="button"
              className="btn-press rounded-md bg-paper px-2 py-1 text-fg disabled:opacity-40"
              disabled={bounds.current.end >= content.length}
              onClick={() => moveSlice(1)}
            >
              下一段
            </button>
          </span>
        </div>
      ) : null}
      <div className={cn("relative min-h-0 w-full flex-1", centered && "mx-auto max-w-prose")}>
        {focusMirror ? (
          <div className="editor-focus-mirror" aria-hidden="true">
            <div
              ref={mirrorRef}
              className="editor-surface editor-focus-copy px-5 py-6 font-serif text-editor sm:px-8 sm:py-10"
            >
              <span className="editor-focus-dim">{windowText.slice(0, range.start)}</span>
              <span>{windowText.slice(range.start, range.end)}</span>
              <span className="editor-focus-dim">{windowText.slice(range.end)}</span>
            </div>
          </div>
        ) : null}
        <div
          ref={probeRef}
          className="editor-caret-probe editor-surface px-5 py-6 font-serif text-editor sm:px-8 sm:py-10"
          aria-hidden="true"
        />
        <textarea
          key={`${noteId}-${epoch}-${sliceTick}`}
          id="note-editor"
          defaultValue={windowText}
          onChange={(event) => {
            commit(event.target.value);
            const composing =
              event.nativeEvent instanceof InputEvent && event.nativeEvent.isComposing;
            trackCaret(event.currentTarget, !composing);
          }}
        onFocus={() => onEditingChange?.(true)}
        onBlur={() => onEditingChange?.(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          const el = event.currentTarget;
          const next = indentLines(
            el.value,
            el.selectionStart,
            el.selectionEnd,
            event.shiftKey ? -1 : 1,
          );
          el.value = next.value;
          commit(next.value);
          requestAnimationFrame(() =>
            el.setSelectionRange(next.start, next.end),
          );
        }}
        onKeyUp={(event) => trackCaret(event.currentTarget, !event.nativeEvent.isComposing)}
        onClick={(event) => trackCaret(event.currentTarget, true)}
        onSelect={(event) => trackCaret(event.currentTarget, true)}
        onPaste={handlePaste}
        onDragOver={(event) => {
          if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
        }}
        onDrop={handleDrop}
        onScroll={(event) => {
          if (focusMirror) syncMirror(event.currentTarget);
          followScroll(event.currentTarget);
          onScroll?.();
        }}
        placeholder="从第一行开始写，它会成为标题…"
        spellCheck
        lang="zh-CN"
        autoCapitalize="sentences"
        autoCorrect="on"
        enterKeyHint="enter"
        aria-label="笔记正文"
        className={cn(
          "editor-surface min-h-0 h-full w-full resize-none bg-transparent px-5 py-6 font-serif text-editor text-fg",
          "placeholder:text-subtle",
          "outline-none sm:px-8 sm:py-10",
          focusMirror && "is-focus-input",
        )}
        />
      </div>
    </div>
  );
}
