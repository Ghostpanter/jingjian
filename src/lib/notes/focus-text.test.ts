import assert from "node:assert/strict";
import { test } from "node:test";
import { paragraphAt, typewriterScroll } from "./focus-text.ts";

test("focus mode highlights the paragraph around the caret", () => {
  const text = "甲\n\n乙行\n\n丙";
  const mid = text.indexOf("乙");
  const range = paragraphAt(text, mid);
  assert.equal(text.slice(range.start, range.end), "乙行");
  assert.deepEqual(paragraphAt("只有一段", 2), { start: 0, end: 4 });
  assert.deepEqual(paragraphAt("", 0), { start: 0, end: 0 });
});

test("typewriter scroll keeps the caret above the fold", () => {
  assert.equal(typewriterScroll(0, 28, 400), 0);
  assert.equal(typewriterScroll(500, 28, 400), 500 - 168 + 14);
});
