import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeChapterNotes, moveChapterToNotes, splitChapterNotes } from "./chapters.ts";
import type { Note } from "./types.ts";

function chapter(id: string, index: number, content: string): Note {
  return {
    id,
    content,
    createdAt: 1,
    updatedAt: 1,
    bookId: "book",
    bookTitle: "书",
    chapterIndex: index,
  };
}

test("a chapter can move to a chosen index", () => {
  const notes = [chapter("a", 0, "# 甲"), chapter("b", 1, "# 乙"), chapter("c", 2, "# 丙")];
  const moved = moveChapterToNotes(notes, "c", 0);
  const order = moved
    ?.filter((note) => note.bookId)
    .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0))
    .map((note) => note.id);
  assert.deepEqual(order, ["c", "a", "b"]);
});

test("merge appends the next chapter and split cuts at a line", () => {
  const notes = [chapter("a", 0, "# 甲\n\n上"), chapter("b", 1, "# 乙\n\n下")];
  const merged = mergeChapterNotes(notes, "a", 5);
  assert.equal(merged?.removedId, "b");
  assert.match(merged?.notes.find((note) => note.id === "a")?.content ?? "", /上\n\n# 乙/);
  assert.equal(merged?.notes.some((note) => note.id === "b"), false);
  const source = chapter("a", 0, "# 甲\n第一段\n第二段\n");
  const split = splitChapterNotes([source], "a", source.content.indexOf("第二段"), 6, "new");
  assert.equal(split?.createdId, "new");
  assert.match(split?.notes.find((note) => note.id === "a")?.content ?? "", /第一段/);
  assert.doesNotMatch(split?.notes.find((note) => note.id === "a")?.content ?? "", /第二段/);
  assert.match(split?.notes.find((note) => note.id === "new")?.content ?? "", /^第二段/);
});
