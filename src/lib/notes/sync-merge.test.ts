import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeNotes, mergeNoteContent, reconcileNotes } from "./sync-merge.ts";
import type { Note } from "./types.ts";

function note(id: string, updatedAt: number, content = id): Note {
  return { id, content, createdAt: 1, updatedAt };
}

test("downloads unknown remote notes", () => {
  const result = mergeNotes({
    local: [note("a", 10)],
    remote: [note("a", 10), note("b", 20)],
    tombstones: {},
  });
  assert.deepEqual(
    result.notes.map((item) => item.id).sort(),
    ["a", "b"],
  );
  assert.equal(result.toUpload.length, 0);
});

test("uploads local notes missing remotely", () => {
  const result = mergeNotes({
    local: [note("a", 10)],
    remote: [],
    tombstones: {},
  });
  assert.equal(result.toUpload[0]?.id, "a");
});

test("last write wins", () => {
  const result = mergeNotes({
    local: [note("a", 30, "local")],
    remote: [note("a", 20, "remote")],
    tombstones: {},
  });
  assert.equal(result.notes[0]?.content, "local");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.toUpload.length, 0);
});

test("tombstone deletes older remote", () => {
  const result = mergeNotes({
    local: [],
    remote: [note("a", 20)],
    tombstones: { a: 50 },
  });
  assert.deepEqual(result.toDeleteRemote, ["a"]);
  assert.equal(result.notes.length, 0);
});

test("newer remote restores a tombstone", () => {
  const result = mergeNotes({
    local: [],
    remote: [note("a", 80, "kept")],
    tombstones: { a: 50 },
  });
  assert.equal(result.notes[0]?.content, "kept");
  assert.equal(result.tombstones.a, undefined);
});

test("merge keeps the longer side when one is a prefix", () => {
  assert.equal(mergeNoteContent("你好", "你好世界"), "你好世界");
  const reconciled = reconcileNotes(
    [note("a", Date.now(), "正在写")],
    [note("a", Date.now() - 50_000, "云端旧稿")],
    "a",
  );
  assert.equal(reconciled.notes[0]?.content, "正在写");
  assert.equal(reconciled.activeContentChanged, false);
});

test("active local draft is uploaded even if remote is newer", () => {
  const result = mergeNotes({
    local: [note("a", 90_000, "正在写")],
    remote: [note("a", 95_000, "云端旧稿")],
    tombstones: {},
    activeId: "a",
    now: 100_000,
    protectActive: true,
  });
  assert.equal(result.notes[0]?.content, "正在写");
  assert.equal(result.toUpload[0]?.content, "正在写");
});

test("idle remote wins when the editor is not active", () => {
  const result = mergeNotes({
    local: [note("a", 10, "本机旧稿")],
    remote: [note("a", 20, "云端新稿")],
    tombstones: {},
    activeId: "b",
    now: 1_000_000,
  });
  assert.equal(result.notes[0]?.content, "本机旧稿");
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.toUpload.length, 0);
});

test("prefix or contained drafts still auto merge", () => {
  const longer = mergeNotes({
    local: [note("a", 30, "你好世界")],
    remote: [note("a", 20, "你好")],
    tombstones: {},
  });
  assert.equal(longer.notes[0]?.content, "你好世界");
  assert.equal(longer.conflicts.length, 0);
  assert.equal(longer.toUpload[0]?.content, "你好世界");
});

test("progress-only local changes are uploaded without a conflict", () => {
  const local: Note = {
    id: "a",
    content: "同一章",
    createdAt: 1,
    updatedAt: 20,
    readAt: 90,
    readRatio: 0.6,
  };
  const remote: Note = {
    id: "a",
    content: "同一章",
    createdAt: 1,
    updatedAt: 40,
    readAt: 10,
    readRatio: 0.1,
  };
  const result = mergeNotes({ local: [local], remote: [remote], tombstones: {} });
  assert.equal(result.notes[0]?.content, "同一章");
  assert.equal(result.notes[0]?.updatedAt, 40);
  assert.equal(result.notes[0]?.readAt, 90);
  assert.equal(result.notes[0]?.readRatio, 0.6);
  assert.equal(result.conflicts.length, 0);
  assert.equal(result.toUpload[0]?.readAt, 90);
});
