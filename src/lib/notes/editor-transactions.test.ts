import assert from "node:assert/strict";
import { test } from "node:test";
import { EditorState } from "@codemirror/state";
import { history, undo } from "@codemirror/commands";
import { diffChange, markupTransaction, selectionOf } from "./editor-transactions.ts";
import { indentLines, insertTable, toggleTaskList, toggleUnorderedList, wrapInline } from "./insert-markup.ts";

function stateWith(doc: string, from: number, to = from) {
  return EditorState.create({ doc, selection: { anchor: from, head: to }, extensions: [history()] });
}

function apply(state: EditorState, edit: { value: string; start: number; end: number }) {
  return state.update(markupTransaction(state, edit)).state;
}

test("diffChange replaces only the changed span", () => {
  assert.deepEqual(diffChange("hello world", "hello brave world"), { from: 6, to: 6, insert: "brave " });
  assert.deepEqual(diffChange("aaa", "aa"), { from: 2, to: 3, insert: "" });
  assert.equal(diffChange("same", "same"), null);
});

test("bold through a transaction keeps the selection on the word", () => {
  const state = stateWith("写一个词。", 3, 4);
  const { value, start, end } = selectionOf(state);
  const next = apply(state, wrapInline(value, start, end, "**"));
  assert.equal(next.doc.toString(), "写一个**词**。");
  assert.equal(next.sliceDoc(next.selection.main.from, next.selection.main.to), "词");
});

test("list, task and indent helpers work on a CodeMirror state and undo in one step", () => {
  let state = stateWith("一\n二", 0, 3);
  const sel = selectionOf(state);
  state = apply(state, toggleUnorderedList(sel.value, sel.start, sel.end));
  assert.equal(state.doc.toString(), "- 一\n- 二");
  const task = selectionOf(state);
  state = apply(state, toggleTaskList(task.value, task.start, task.end));
  assert.match(state.doc.toString(), /- \[ \] 一\n- \[ \] 二/);
  const ind = selectionOf(state);
  state = apply(state, indentLines(ind.value, ind.start, ind.end, 1));
  assert.match(state.doc.toString(), /^\s+- \[ \] 一/);
  let undone = state;
  undo({ state: undone, dispatch: (tr) => (undone = tr.state) });
  assert.match(undone.doc.toString(), /^- \[ \] 一/);
});

test("a table inserts at the caret without touching the rest", () => {
  const state = stateWith("前文\n\n后文", 2);
  const sel = selectionOf(state);
  const next = apply(state, insertTable(sel.value, sel.start, sel.end));
  assert.ok(next.doc.toString().startsWith("前文"));
  assert.ok(next.doc.toString().endsWith("后文"));
  assert.match(next.doc.toString(), /\|/);
});
