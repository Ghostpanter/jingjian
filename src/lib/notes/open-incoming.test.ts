import assert from "node:assert/strict";
import { test } from "node:test";
import {
  classifyIncoming,
  noteFromIncoming,
  stableIncomingId,
} from "./open-incoming.ts";

test("classifies markdown, txt, ebooks and images", () => {
  assert.equal(classifyIncoming("笔记.md"), "markdown");
  assert.equal(classifyIncoming("a.markdown", "application/octet-stream"), "markdown");
  assert.equal(classifyIncoming("draft.txt"), "txt");
  assert.equal(classifyIncoming("book.epub"), "ebook");
  assert.equal(classifyIncoming("novel.mobi"), "ebook");
  assert.equal(classifyIncoming("kindle.azw3"), "ebook");
  assert.equal(classifyIncoming("story.fb2"), "ebook");
  assert.equal(classifyIncoming("page.html"), "ebook");
  assert.equal(classifyIncoming("cover.png", "image/png"), "image");
  assert.equal(classifyIncoming("share", "text/plain"), "text");
});

test("stable incoming ids stay the same for the same uri", () => {
  const first = stableIncomingId("content://media/note.md");
  const second = stableIncomingId("content://media/note.md");
  assert.equal(first, second);
  assert.notEqual(first, stableIncomingId("content://media/other.md"));
  assert.match(first, /^open-[0-9a-f]+[0-9a-f]{4}-/);
});

test("incoming markdown reuses frontmatter id; txt uses fallback", () => {
  const md = noteFromIncoming(
    "---\nid: 11111111-1111-4111-8111-111111111111\ncreatedAt: 1\nupdatedAt: 2\n---\n# 窗边\n",
    "markdown",
    "open-abcd0001-a1b2-4c3d-8e9f-0123456789ab",
  );
  assert.equal(md.id, "11111111-1111-4111-8111-111111111111");
  assert.match(md.content, /窗边/);
  const txt = noteFromIncoming(
    "hello",
    "txt",
    "open-ffff0001-a1b2-4c3d-8e9f-0123456789ab",
  );
  assert.equal(txt.format, "txt");
  assert.equal(txt.id, "open-ffff0001-a1b2-4c3d-8e9f-0123456789ab");
  assert.equal(txt.content, "hello");
});
