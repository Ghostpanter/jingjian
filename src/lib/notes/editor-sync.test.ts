import assert from "node:assert/strict";
import { test } from "node:test";
import { shouldApplyExternalContent } from "./editor-sync.ts";

test("ignores the echo of a keystroke we just emitted", () => {
  assert.equal(
    shouldApplyExternalContent({
      content: "hello",
      lastEmitted: "hello",
      doc: "hello",
      composing: false,
    }),
    false,
  );
});

test("ignores when doc already matches the latest parent value", () => {
  assert.equal(
    shouldApplyExternalContent({
      content: "hello!",
      lastEmitted: "hello",
      doc: "hello!",
      composing: false,
    }),
    false,
  );
});

test("applies a real external edit (preview checkbox, sync, replace)", () => {
  assert.equal(
    shouldApplyExternalContent({
      content: "- [x] done",
      lastEmitted: "- [ ] done",
      doc: "- [ ] done",
      composing: false,
    }),
    true,
  );
});

test("never applies while IME composition is active", () => {
  assert.equal(
    shouldApplyExternalContent({
      content: "你好",
      lastEmitted: "你",
      doc: "你",
      composing: true,
    }),
    false,
  );
});
