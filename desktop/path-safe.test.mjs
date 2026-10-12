import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { isInside, openExternalSafe, safeFolderFileName } from "./path-safe.mjs";

test("safeFolderFileName strips traversal and nested segments", () => {
  assert.equal(safeFolderFileName("../../evil.md"), "evil.md");
  assert.equal(safeFolderFileName("a/b/c.md"), "c.md");
  assert.equal(safeFolderFileName("..\\..\\x.md"), "x.md");
  assert.equal(safeFolderFileName("."), "未命名.md");
  assert.equal(safeFolderFileName(".."), "未命名.md");
  assert.equal(safeFolderFileName(""), "未命名.md");
  assert.equal(safeFolderFileName("note.md"), "note.md");
});

test("isInside rejects escapes", () => {
  const root = path.resolve("/tmp/jingjian-sync");
  assert.equal(isInside(root, path.join(root, "a.md")), true);
  assert.equal(isInside(root, path.resolve(root, "../outside.md")), false);
  assert.equal(isInside(root, root), true);
});

test("openExternalSafe allows only http(s)", () => {
  const opened = [];
  assert.equal(openExternalSafe("https://example.com", (u) => opened.push(u)), true);
  assert.equal(openExternalSafe("http://localhost:8787", (u) => opened.push(u)), true);
  assert.equal(openExternalSafe("file:///etc/passwd", (u) => opened.push(u)), false);
  assert.equal(openExternalSafe("javascript:alert(1)", (u) => opened.push(u)), false);
  assert.deepEqual(opened, ["https://example.com", "http://localhost:8787"]);
});
