import { EditorSelection, type EditorState, type TransactionSpec } from "@codemirror/state";

/** The smallest single replacement that turns `before` into `after`. */
export function diffChange(before: string, after: string): { from: number; to: number; insert: string } | null {
  if (before === after) return null;
  const max = Math.min(before.length, after.length);
  let head = 0;
  while (head < max && before.charCodeAt(head) === after.charCodeAt(head)) head += 1;
  let tail = 0;
  while (
    tail < max - head &&
    before.charCodeAt(before.length - 1 - tail) === after.charCodeAt(after.length - 1 - tail)
  ) {
    tail += 1;
  }
  return { from: head, to: before.length - tail, insert: after.slice(head, after.length - tail) };
}

function clamp(value: number, length: number): number {
  return Math.max(0, Math.min(value, length));
}

/**
 * Turn a whole-text markdown helper result (bold, list, table, link…) into a
 * CodeMirror transaction. Only the changed span is replaced, so undo, the
 * cursor elsewhere and CodeMirror's incremental parsing all keep working.
 */
export function markupTransaction(
  state: EditorState,
  edit: { value: string; start: number; end: number },
): TransactionSpec {
  const change = diffChange(state.doc.toString(), edit.value);
  const length = edit.value.length;
  const anchor = clamp(edit.start, length);
  const head = clamp(Math.max(edit.start, edit.end), length);
  return {
    changes: change ?? undefined,
    selection: EditorSelection.single(anchor, head),
    scrollIntoView: true,
    userEvent: "input.markup",
  };
}

/** Read the main selection the way the markdown helpers expect it. */
export function selectionOf(state: EditorState): { value: string; start: number; end: number; selected: string } {
  const value = state.doc.toString();
  const { from, to } = state.selection.main;
  return { value, start: from, end: to, selected: value.slice(from, to) };
}
