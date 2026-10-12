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
