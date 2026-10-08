import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chapterProgress,
  excerptNoteContent,
  foldChapters,
  lastReadChapter,
  withLatestProgress,
} from "./reader-progress.ts";
import type { Note } from "./types.ts";

function note(
  id: string,
  extra: Partial<Note> = {},
): Note {
  return { id, content: id, createdAt: 1, updatedAt: 1, ...extra };
}

test("last read chapter prefers the newest readAt", () => {
  const chapters = [
    note("a", { chapterIndex: 0, readAt: 10 }),
    note("b", { chapterIndex: 1, readAt: 40 }),
    note("c", { chapterIndex: 2, readAt: 20 }),
  ];
  assert.equal(lastReadChapter(chapters)?.id, "b");
  assert.deepEqual(chapterProgress(chapters), { current: 2, total: 3 });
});

test("long books fold into chapter ranges and short books stay flat", () => {
  assert.equal(foldChapters([1, 2, 3]), null);
  const spans = foldChapters(Array.from({ length: 41 }, (_, index) => index));
  assert.equal(spans?.length, 2);
  assert.equal(spans?.[0]?.label, "第1–40章");
  assert.equal(spans?.[0]?.notes.length, 40);
  assert.equal(spans?.[1]?.label, "第41章");
  assert.deepEqual(spans?.[1]?.notes, [40]);
});

test("progress merge keeps the later read position without touching content", () => {
  const local = note("a", { content: "正文", updatedAt: 5, readAt: 80, readRatio: 0.4 });
  const remote = note("a", { content: "正文", updatedAt: 9, readAt: 20, readRatio: 0.1 });
  const merged = withLatestProgress(remote, local, remote);
  assert.equal(merged.content, "正文");
  assert.equal(merged.updatedAt, 9);
  assert.equal(merged.readAt, 80);
  assert.equal(merged.readRatio, 0.4);
});

test("the later trash mark wins without touching the body", () => {
  const local = note("a", { content: "正文", trashedAt: 10 });
  const remote = note("a", { content: "正文", restoredAt: 40 });
  const merged = withLatestProgress(local, local, remote);
  assert.equal(merged.content, "正文");
  assert.equal(merged.restoredAt, 40);
  assert.equal((merged.trashedAt ?? 0) > (merged.restoredAt ?? 0), false);
});

test("excerpt note quotes the selection", () => {
  const text = excerptNoteContent({
    bookTitle: "廊下三章",
    chapterTitle: "一 廊下",
    quote: "不必读完。",
  });
  assert.match(text, /^# 摘自《廊下三章》/m);
  assert.match(text, /^> 不必读完。/m);
  assert.match(text, /来自「一 廊下」/);
});
