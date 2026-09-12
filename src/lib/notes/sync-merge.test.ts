import assert from "node:assert/strict";
import { test } from "node:test";
import { mergeNotes } from "./sync-merge.ts";
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
  assert.equal(result.toUpload[0]?.content, "local");
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
