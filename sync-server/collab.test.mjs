import test from "node:test";
import assert from "node:assert/strict";
import { applyOps, transform, OtServerDoc } from "./collab.mjs";

function rnd(n) {
  return Math.floor(Math.random() * n);
}
function randOp(text) {
  if (text.length && Math.random() < 0.4) {
    const p = rnd(text.length);
    return [[1, p, 1 + rnd(Math.min(4, text.length - p))]];
  }
  return [[0, rnd(text.length + 1), "中文ab".slice(0, 1 + rnd(4))]];
}

test("transform converges (fuzz)", () => {
  for (let i = 0; i < 2000; i++) {
    const doc = "静笺协作测试".repeat(1 + rnd(3));
    const a = randOp(doc), b = randOp(doc);
    const [a1, b1] = transform(a, b);
    assert.equal(applyOps(applyOps(doc, a), b1), applyOps(applyOps(doc, b), a1));
  }
});

test("server doc rebases stale revisions", () => {
  const d = new OtServerDoc("abc");
  d.receive(0, [[0, 3, "X"]]);
  const o = d.receive(0, [[0, 0, "Y"]]);
  assert.deepEqual(o, [[0, 0, "Y"]]);
  assert.equal(d.text, "YabcX");
  assert.throws(() => d.receive(9, []));
});
