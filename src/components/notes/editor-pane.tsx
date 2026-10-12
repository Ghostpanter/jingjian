import { useEffect, useLayoutEffect, useRef } from "react";
import { toast } from "sonner";
import { Compartment, EditorSelection, EditorState, Transaction, type Extension } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  placeholder,
  ViewPlugin,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { history, historyKeymap, standardKeymap } from "@codemirror/commands";
import { parser as markdownParser, GFM } from "@lezer/markdown";
import { defineLanguageFacet, HighlightStyle, Language, LanguageSupport, syntaxHighlighting } from "@codemirror/language";
import { highlightSelectionMatches } from "@codemirror/search";
import { tags } from "@lezer/highlight";
import { indentLines, looksLikeUrl, normalizeHref, wrapAsMarkup } from "@/lib/notes/insert-markup";
import { insertImageAtCursor } from "@/lib/notes/image-insert";
import { peekPendingReveal } from "@/lib/notes/format";
import { classifyIncoming } from "@/lib/notes/open-incoming";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";
import { setActiveEditor } from "@/lib/notes/editor-bridge";
import { diffChange, markupTransaction } from "@/lib/notes/editor-transactions";
import { shouldApplyExternalContent } from "@/lib/notes/editor-sync";
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

// The Markdown + GFM grammar straight from @lezer/markdown. @codemirror/lang-markdown
// would also pull in the HTML, CSS and JavaScript grammars (~0.5 MB) for
// embedded code, which the APK does not need.
const markdownSupport = new LanguageSupport(
  new Language(defineLanguageFacet({ commentTokens: { block: { open: "<!--", close: "-->" } } }), markdownParser.configure(GFM), [], "markdown"),
);

const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontWeight: "700", fontSize: "1.3em" },
  { tag: tags.heading2, fontWeight: "700", fontSize: "1.18em" },
  { tag: [tags.heading3, tags.heading4, tags.heading5, tags.heading6], fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: [tags.link, tags.url], color: "var(--color-accent)" },
  { tag: tags.monospace, fontFamily: "var(--font-mono, ui-monospace, monospace)", fontSize: "0.92em" },
  { tag: tags.quote, color: "var(--color-muted)" },
  { tag: [tags.processingInstruction, tags.meta, tags.contentSeparator], color: "var(--color-subtle)" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--color-fg)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.75", overflowX: "hidden" },
  ".cm-content": { caretColor: "var(--color-fg)", minHeight: "100%" },
  ".cm-line": { padding: "0" },
  ".cm-placeholder": { color: "var(--color-subtle)" },
  ".cm-selectionMatch": { backgroundColor: "color-mix(in srgb, var(--color-mark) 55%, transparent)" },
  ".cm-focus-dim": { opacity: "0.32", transition: "opacity 120ms ease-out" },
});

/** Paragraph (run of non-blank lines) around `pos`, by lines, without copying the doc. */
function paragraphRange(state: EditorState, pos: number): { from: number; to: number } {
  const doc = state.doc;
  let first = doc.lineAt(pos);
  let last = first;
  if (first.text.trim() === "") return { from: first.from, to: first.to };
  while (first.number > 1) {
    const prev = doc.line(first.number - 1);
    if (prev.text.trim() === "") break;
    first = prev;
  }
  while (last.number < doc.lines) {
    const next = doc.line(last.number + 1);
    if (next.text.trim() === "") break;
    last = next;
  }
  return { from: first.from, to: last.to };
}

const dimMark = Decoration.mark({ class: "cm-focus-dim" });

function focusDecorations(state: EditorState): DecorationSet {
  const { from, to } = paragraphRange(state, state.selection.main.head);
  const ranges = [];
  if (from > 0) ranges.push(dimMark.range(0, from));
  if (to < state.doc.length) ranges.push(dimMark.range(to, state.doc.length));
  return Decoration.set(ranges);
}

/** Focus mode: dim everything but the paragraph being written and keep the caret mid-screen. */
function focusModeExtension(): Extension {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return [
    ViewPlugin.fromClass(
      class {
        decorations: DecorationSet;
        constructor(view: EditorView) {
          this.decorations = focusDecorations(view.state);
        }
        update(update: ViewUpdate) {
          if (update.docChanged || update.selectionSet) this.decorations = focusDecorations(update.state);
        }
      },
      { decorations: (plugin) => plugin.decorations },
    ),
    reduced
      ? []
      : EditorState.transactionExtender.of((tr) =>
          tr.selection && tr.selection.main.empty
            ? { effects: EditorView.scrollIntoView(tr.selection.main.head, { y: "center" }) }
            : null,
        ),
  ];
}

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
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const focusSlot = useRef(new Compartment());
  // Latest callbacks, read from inside CodeMirror without rebuilding it.
  const props = useRef({ onChange, onImportFiles, onScroll, onEditingChange });
  props.current = { onChange, onImportFiles, onScroll, onEditingChange };
  // Last doc we pushed via onChange. Must not be reset from the content prop —
  // a stale parent render would otherwise look like an external edit and wipe
  // keystrokes that landed between dispatch and re-render (IME suffers most).
  const lastEmitted = useRef(content);
  const contentRef = useRef(content);
  contentRef.current = content;

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const run = (view: EditorView, edit: { value: string; start: number; end: number }) => {
      view.dispatch(markupTransaction(view.state, edit));
      return true;
    };

    async function insertFiles(view: EditorView, files: File[]) {
      const images = files.filter((file) => file.type.startsWith("image/"));
      if (images.length === 0) return;
      try {
        for (const file of images) {
          // Resolve the image first, then insert at the *current* caret. Building
          // a whole new document from a snapshot taken before the await would
          // wipe anything the user typed while compress/upload was running.
          const snapshot = view.state.doc.toString();
          const caret = view.state.selection.main.head;
          const next = await insertImageAtCursor(snapshot, caret, caret, file, file.name);
          if (!view.dom.isConnected) return;
          const live = view.state.doc.toString();
          const liveCaret = view.state.selection.main.head;
          if (live === snapshot) {
            run(view, { value: next.value, start: next.cursor, end: next.cursor });
          } else {
            const snippet = next.value.slice(caret, next.cursor);
            const value = live.slice(0, liveCaret) + snippet + live.slice(liveCaret);
            const cursor = liveCaret + snippet.length;
            run(view, { value, start: cursor, end: cursor });
          }
        }
        toast.message(images.length > 1 ? `已插入 ${images.length} 张图片` : "已插入图片");
      } catch (error) {
        toast.message(error instanceof Error ? error.message : "图片插入失败");
      }
    }

    const indent = (dir: 1 | -1) => (view: EditorView) => {
      const { from, to } = view.state.selection.main;
      const next = indentLines(view.state.doc.toString(), from, to, dir);
      return run(view, next);
    };

    const state = EditorState.create({
      doc: content,
      extensions: [
        history(),
        drawSelection(),
        markdownSupport,
        syntaxHighlighting(markdownHighlight),
        highlightSelectionMatches(),
        EditorView.lineWrapping,
        placeholder("从第一行开始写，它会成为标题…"),
        editorTheme,
        // App shortcuts (Ctrl+B/I/U/K/E/F/P, Ctrl+/ …) stay with the app, so
        // only movement, editing and undo are bound here.
        keymap.of([
          { key: "Tab", run: indent(1), shift: indent(-1) },
          ...standardKeymap,
          ...historyKeymap.filter((binding) => binding.key !== "Mod-u" && binding.key !== "Alt-u"),
        ]),
        EditorView.contentAttributes.of({
          id: "note-editor",
          "aria-label": "笔记正文",
          spellcheck: "true",
          lang: "zh-CN",
          autocapitalize: "sentences",
          autocorrect: "on",
          enterkeyhint: "enter",
          class: "editor-surface font-serif text-editor text-fg",
        }),
        focusSlot.current.of(focusMode ? focusModeExtension() : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !update.transactions.some((tr) => tr.annotation(Transaction.remote))) {
            const value = update.state.doc.toString();
            lastEmitted.current = value;
            props.current.onChange(value);
          }
          if (update.focusChanged) props.current.onEditingChange?.(update.view.hasFocus);
        }),
        EditorView.domEventHandlers({
          paste(event, view) {
            const data = event.clipboardData;
            if (!data) return false;
            const files = [...data.files];
            if (files.some((file) => file.type.startsWith("image/"))) {
              event.preventDefault();
              void insertFiles(view, files);
              return true;
            }
            const clip = data.getData("text/plain").trim();
            const { from, to } = view.state.selection.main;
            if (!looksLikeUrl(clip) || from === to) return false;
            event.preventDefault();
            const value = view.state.doc.toString();
            const next = wrapAsMarkup(value, from, to, value.slice(from, to), normalizeHref(clip), false);
            return run(view, { value: next.value, start: next.cursor, end: next.cursor });
          },
          dragover(event) {
            if ([...(event.dataTransfer?.types ?? [])].includes("Files")) event.preventDefault();
            return false;
          },
          drop(event, view) {
            const files = [...(event.dataTransfer?.files ?? [])];
            const images = files.filter((file) => {
              const kind = classifyIncoming(file.name, file.type);
              return kind === "image" || file.type.startsWith("image/");
            });
            const docs = files.filter((file) => {
              const kind = classifyIncoming(file.name, file.type);
              return kind === "markdown" || kind === "txt" || kind === "ebook";
            });
            if (images.length === 0 && docs.length === 0) return false;
            event.preventDefault();
            if (images.length) void insertFiles(view, images);
            if (docs.length) props.current.onImportFiles?.(docs);
            return true;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    lastEmitted.current = view.state.doc.toString();
    setActiveEditor(view);
    const onScrollDom = () => props.current.onScroll?.();
    view.scrollDOM.addEventListener("scroll", onScrollDom, { passive: true });

    // Android soft keyboard: body resize alone still leaves the caret under the
    // keyboard until we ask CodeMirror to scroll it into the visible area.
    let removeKeyboard: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      let handle: { remove: () => Promise<void> } | undefined;
      void Keyboard.addListener("keyboardDidShow", () => {
        const live = viewRef.current;
        if (!live) return;
        live.dispatch({
          effects: EditorView.scrollIntoView(live.state.selection.main.head, { y: "center" }),
        });
        live.requestMeasure();
      }).then((listener) => {
        handle = listener;
      });
      removeKeyboard = () => {
        void handle?.remove();
      };
    }

    const pending = peekPendingReveal(noteId);
    if (pending) placeSelection(view, pending.start, pending.end);

    return () => {
      removeKeyboard?.();
      view.scrollDOM.removeEventListener("scroll", onScrollDom);
      setActiveEditor(null);
      view.destroy();
      viewRef.current = null;
    };
    // A new note or an external reload (epoch) gets a fresh editor and history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, epoch]);

  // Content changed outside the editor (sync, a task ticked in the preview…).
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    // Read the latest prop through a ref so a stale effect from an older
    // render cannot overwrite newer keystrokes.
    const target = contentRef.current;
    const current = view.state.doc.toString();
    if (
      !shouldApplyExternalContent({
        content: target,
        lastEmitted: lastEmitted.current,
        doc: current,
        composing: view.composing,
      })
    ) {
      if (target === current) lastEmitted.current = target;
      return;
    }
    const change = diffChange(current, target);
    if (!change) {
      lastEmitted.current = target;
      return;
    }
    view.dispatch({
      changes: change,
      annotations: [Transaction.remote.of(true), Transaction.addToHistory.of(false)],
    });
    lastEmitted.current = target;
  }, [content]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: focusSlot.current.reconfigure(focusMode ? focusModeExtension() : []),
    });
  }, [focusMode]);

  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<{ start?: number; end?: number; noteId?: string }>).detail;
      const view = viewRef.current;
      if (!view || !detail || typeof detail.start !== "number") return;
      if (detail.noteId && detail.noteId !== noteId) return;
      placeSelection(view, detail.start, typeof detail.end === "number" ? detail.end : detail.start);
    };
    window.addEventListener("jingjian-reveal", onReveal);
    return () => window.removeEventListener("jingjian-reveal", onReveal);
  }, [noteId]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={hostRef}
        className={cn("note-editor-host relative min-h-0 w-full flex-1", centered && "mx-auto max-w-prose")}
      />
    </div>
  );
}

function placeSelection(view: EditorView, start: number, end: number) {
  const length = view.state.doc.length;
  const from = Math.max(0, Math.min(start, length));
  const to = Math.max(from, Math.min(end, length));
  const active = document.activeElement;
  view.dispatch({
    selection: EditorSelection.single(from, to),
    effects: EditorView.scrollIntoView(from, { y: "center" }),
  });
  view.focus();
  if (active instanceof HTMLElement && (active.id === "note-find" || active.id === "note-replace")) {
    active.focus();
  }
}
