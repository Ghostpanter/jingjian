import assert from "node:assert/strict";
import { test } from "node:test";
import { contentOffset, mapScroll, ratioAnchors, scrollMax } from "./scroll-sync.ts";

test("percentage mapping without anchors", () => {
  assert.equal(scrollMax(200, 50), 150);
  assert.equal(mapScroll(0, 100, 200, [], []), 0);
  assert.equal(mapScroll(50, 100, 200, [], []), 100);
  assert.equal(mapScroll(100, 100, 200, [], []), 200);
});

test("heading anchors interpolate between pairs", () => {
  const { from, to } = ratioAnchors([50], 100, [20], 100);
  assert.deepEqual(from[0], 0);
  assert.deepEqual(from.at(-1), 1);
  const mid = mapScroll(25, 100, 400, from, to);
  assert.ok(mid > 0 && mid < 400);
  const atHeading = mapScroll(50, 100, 400, from, to);
  assert.ok(Math.abs(atHeading - 80) < 1e-6);
});

test("contentOffset is viewport top plus current scroll", () => {
  assert.equal(contentOffset(80, 10, 40), 110);
  assert.equal(contentOffset(10, 10, 0), 0);
});
