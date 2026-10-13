import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  dedupeNotes,
  filenameFor,
  isInsideDir,
  parseNote,
} from "./note-file.mjs";

test("parseNote strips BOM so Windows frontmatter still parses", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const raw =
    "\uFEFF---\r\nid: " +
    id +
    "\r\ncreatedAt: 100\r\nupdatedAt: 200\r\n---\r\nhello\r\n";
  const note = parseNote(raw, "fallback");
  assert.equal(note.id, id);
  assert.equal(note.createdAt, 100);
  assert.equal(note.updatedAt, 200);
  assert.equal(note.content, "hello\r\n");
});

test("isInsideDir rejects sibling prefix escapes", () => {
  const root = path.resolve("/data/notes");
  assert.equal(isInsideDir(root, path.join(root, "a.md")), true);
  assert.equal(isInsideDir(root, path.resolve("/data/notes_backup/x.md")), false);
  assert.equal(isInsideDir(root, path.resolve(root, "../outside.md")), false);
});

test("filenameFor strips path separators from titles", () => {
  const name = filenameFor({
    id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
    content: "# a/b\\c:*?\nbody",
    createdAt: 1,
    updatedAt: 1,
  });
  assert.equal(name.includes("/"), false);
  assert.equal(name.includes("\\"), false);
  assert.match(name, /\.aaaaaaaa\.md$/);
});

test("dedupeNotes keeps the newest updatedAt per id", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  const notes = dedupeNotes([
    { id, updatedAt: 1, content: "old", file: "old.md" },
    { id, updatedAt: 5, content: "new", file: "new.md" },
    { id, updatedAt: 3, content: "mid", file: "mid.md" },
  ]);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].content, "new");
});

test("plain .md without frontmatter keeps a stable id and file times", async () => {
  const { stableIdFor } = await import("./note-file.mjs");
  const a = stableIdFor("读书笔记.md");
  assert.equal(a, stableIdFor("读书笔记.md"));
  assert.notEqual(a, stableIdFor("别的.md"));
  assert.match(a, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  const n = parseNote("hello", a, { createdAt: 10, updatedAt: 20 });
  assert.equal(n.id, a);
  assert.equal(n.createdAt, 10);
  assert.equal(n.updatedAt, 20);
  const fm = parseNote("---\nid: x\n---\nbody", a, { updatedAt: 30 });
  assert.equal(fm.updatedAt, 30);
});
