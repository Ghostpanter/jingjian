import assert from "node:assert/strict";
import { test } from "node:test";
import { parseNoteFile, serializeNote, takeSyncedImages } from "./markdown-file.ts";
import { imageIdsIn, serializeNoteWithImages } from "./sync-images.ts";

test("a sync trailer is stored with the note and stripped from the body", () => {
  const note = {
    id: "11111111-2222-4333-8444-555555555555",
    content: "见图 ![a](images/abc.jpg)\n",
    createdAt: 1,
    updatedAt: 2,
    trashedAt: 9,
  };
  const raw = `${serializeNote(note)}\n%%JINGJIAN-IMAGES%%\nabc image/jpeg aGVsbG8=\n%%END-JINGJIAN-IMAGES%%\n`;
  const parsed = parseNoteFile(raw, "fallback");
  assert.equal(parsed.content, note.content);
  assert.equal(parsed.trashedAt, 9);
  assert.equal(parsed.id, note.id);
  const taken = takeSyncedImages();
  assert.equal(taken.get(note.id)?.[0]?.mime, "image/jpeg");
  assert.deepEqual(imageIdsIn(parsed.content), ["abc"]);
});

test("notes without a local image blob stay plain markdown", async () => {
  const note = {
    id: "11111111-2222-4333-8444-555555555555",
    content: "见图 ![a](images/abc.jpg)\n",
    createdAt: 1,
    updatedAt: 2,
  };
  const raw = await serializeNoteWithImages(note);
  assert.equal(raw, serializeNote(note));
  assert.doesNotMatch(raw, /JINGJIAN-IMAGES/);
});
