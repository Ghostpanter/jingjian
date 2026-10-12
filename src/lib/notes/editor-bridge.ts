import type { EditorView } from "@codemirror/view";
import { markupTransaction, selectionOf } from "./editor-transactions.ts";

/**
 * The note editor is a CodeMirror view. Toolbar actions, find, outline sync
 * and chapter splitting reach it through this bridge instead of a textarea.
 */
let active: EditorView | null = null;

export function setActiveEditor(view: EditorView | null): void {
  active = view;
}

export function activeEditor(): EditorView | null {
  return active && active.dom.isConnected ? active : null;
}

export function readEditorSelection(): { value: string; start: number; end: number; selected: string } | null {
  const view = activeEditor();
  return view ? selectionOf(view.state) : null;
}

export function writeEditorValue(
  next: string,
  cursor: number | { start: number; end: number },
  onChange: (value: string) => void,
): void {
  const start = typeof cursor === "number" ? cursor : cursor.start;
  const end = typeof cursor === "number" ? cursor : cursor.end;
  const view = activeEditor();
  if (!view) {
    onChange(next);
    return;
  }
  // The editor's update listener reports the change through its own onChange.
  view.dispatch(markupTransaction(view.state, { value: next, start, end }));
  view.focus();
}

/** Caret offset in the whole note. */
export function editorCaret(): number | null {
  const view = activeEditor();
  return view ? view.state.selection.main.head : null;
}

/** The element that scrolls, for split-view scroll sync. */
export function editorScroller(): HTMLElement | null {
  return activeEditor()?.scrollDOM ?? null;
}
