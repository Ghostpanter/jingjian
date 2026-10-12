import assert from "node:assert/strict";
import { test } from "node:test";
import { cachedMermaidSvg, isReadyMermaidSource, mermaidBlockSource } from "./mermaid-render.ts";

test("mermaid render waits until a diagram keyword is present", () => {
  assert.equal(isReadyMermaidSource(""), false);
  assert.equal(isReadyMermaidSource("flowchart"), false);
  assert.equal(isReadyMermaidSource("A --> B"), false);
  assert.equal(isReadyMermaidSource("flowchart LR\n  A --> B"), true);
  assert.equal(isReadyMermaidSource("  sequenceDiagram\n  Alice->>Bob: hi"), true);
  assert.equal(isReadyMermaidSource("x".repeat(80_001)), false);
});

test("an undrawn diagram has no cached svg", () => {
  assert.equal(cachedMermaidSvg("flowchart LR\n  A --> B"), null);
});

test("a fence keeps its line breaks over a flattened data-source attribute", () => {
  const node = {
    tagName: "PRE",
    textContent: "flowchart LR\n  A --> B",
    getAttribute: () => "flowchart LR  A --> B",
  } as unknown as HTMLElement;
  assert.equal(mermaidBlockSource(node), "flowchart LR\n  A --> B");
});
