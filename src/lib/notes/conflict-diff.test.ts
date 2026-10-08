import assert from "node:assert/strict";
import { test } from "node:test";
import { applyHunks, textHunks } from "./conflict-diff.ts";

test("paragraph hunks keep shared text and let each side be chosen", () => {
  const hunks = textHunks("相同\n\n本机多的\n\n结尾", "相同\n\n远端多的\n\n结尾");
  assert.equal(hunks.filter((hunk) => hunk.kind === "same").length, 2);
  const local = applyHunks(hunks, [true, true]);
  const remote = applyHunks(hunks, [false, false]);
  assert.match(local, /本机多的/);
  assert.doesNotMatch(local, /远端多的/);
  assert.match(remote, /远端多的/);
  assert.doesNotMatch(remote, /本机多的/);
  assert.match(local, /结尾/);
  assert.match(remote, /相同/);
});
