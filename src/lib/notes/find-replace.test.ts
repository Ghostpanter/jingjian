import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyReplacement,
  findMatches,
  indexNear,
  isFindError,
  nextIndex,
  replaceAllMatches,
  replaceRange,
} from "./find-replace.ts";

test("plain find is case-insensitive by default", () => {
  const matches = findMatches("Hello hello HELLO", { query: "hello", regex: false, caseSensitive: false });
  assert.equal(isFindError(matches), false);
  if (isFindError(matches)) return;
  assert.equal(matches.length, 3);
  assert.deepEqual(matches[0], { start: 0, end: 5 });
});

test("regex find and invalid pattern", () => {
  const ok = findMatches("a1 a22 a333", { query: "a\\d+", regex: true, caseSensitive: true });
  assert.equal(isFindError(ok), false);
  if (!isFindError(ok)) assert.equal(ok.length, 3);
  const bad = findMatches("abc", { query: "(", regex: true, caseSensitive: false });
  assert.deepEqual(bad, { error: "正则无效" });
});

test("whole word skips partial tokens", () => {
  const matches = findMatches("cat catalog cat", {
    query: "cat",
    regex: false,
    caseSensitive: false,
    wholeWord: true,
  });
  assert.equal(isFindError(matches), false);
  if (isFindError(matches)) return;
  assert.equal(matches.length, 2);
  assert.deepEqual(matches[1], { start: 12, end: 15 });
});

test("replace current then remaining ranges", () => {
  const text = "foo foo foo";
  const matches = findMatches(text, { query: "foo", regex: false, caseSensitive: true });
  assert.equal(isFindError(matches), false);
  if (isFindError(matches)) return;
  const once = replaceRange(text, matches[1], "bar");
  assert.equal(once, "foo bar foo");
  assert.equal(replaceAllMatches(text, matches, "bar"), "bar bar bar");
});

test("regex replace interpolates capture tokens", () => {
  const text = "a1 a22";
  const query = "a(\\d+)";
  const matches = findMatches(text, { query, regex: true, caseSensitive: true });
  assert.equal(isFindError(matches), false);
  if (isFindError(matches)) return;
  assert.equal(replaceAllMatches(text, matches, "n$1", true, query), "n1 n22");
  assert.equal(applyReplacement(text, matches[0], "n$1", true, query), "n1 a22");
  assert.equal(replaceAllMatches(text, matches, "$$0$0", true, query), "$0a1 $0a22");
});

test("nextIndex wraps and indexNear picks upcoming match", () => {
  assert.equal(nextIndex(2, 3, 1), 0);
  assert.equal(nextIndex(0, 3, -1), 2);
  const matches = [
    { start: 2, end: 4 },
    { start: 10, end: 12 },
  ];
  assert.equal(indexNear(matches, 0), 0);
  assert.equal(indexNear(matches, 5), 1);
  assert.equal(indexNear(matches, 20), 0);
});
