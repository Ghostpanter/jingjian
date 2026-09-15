import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHash, shouldAutosave } from "./save-hash.ts";

test("contentHash is stable for the same body", () => {
  assert.equal(contentHash("静笺"), contentHash("静笺"));
  assert.notEqual(contentHash("静笺"), contentHash("静笺 "));
});

test("shouldAutosave skips unchanged documents", () => {
  const hash = contentHash("# 标题\n\n正文");
  assert.equal(shouldAutosave("# 标题\n\n正文", { path: "a.md", hash, relative: true }), false);
  assert.equal(shouldAutosave("# 标题\n\n改过", { path: "a.md", hash, relative: true }), true);
  assert.equal(shouldAutosave("# 新篇", null), true);
});
