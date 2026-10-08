import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutGraph, linkGraph } from "./link-graph.ts";

test("graph keeps resolved wiki links and drops code, self links, and missing notes", () => {
  const graph = linkGraph([
    { id: "a", content: "# 甲\n\n见 [[乙]]，代码里的 `[[丙]]` 不算。\n```\n[[丁]]\n```" },
    { id: "b", content: "# 乙\n\n回到 [[甲]]。" },
    { id: "c", content: "# 丙\n\n没有链出去。" },
    { id: "d", content: "# 丁\n\n指向 [[没有]]。" },
  ]);
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    ["a", "b", "c", "d"],
  );
  assert.equal(graph.links.length, 1);
  assert.equal(graph.nodes.find((node) => node.id === "a")?.title, "甲");
});

test("aliases connect notes and the page cap can grow", () => {
  const notes = [
    { id: "a", content: "---\naliases: [甲乙]\n---\n# 甲\n" },
    { id: "b", content: "# 乙\n\n[[甲乙]]" },
  ];
  const graph = linkGraph(notes, 1);
  assert.equal(graph.total, 2);
  assert.equal(graph.truncated, true);
  assert.equal(graph.nodes.length, 1);
  const full = linkGraph(notes, Number.POSITIVE_INFINITY);
  assert.equal(full.truncated, false);
  assert.equal(full.links.length, 1);
});

test("nearby mode keeps the current note and its links", () => {
  const notes = [
    { id: "a", content: "# 甲\n[[乙]]" },
    { id: "b", content: "# 乙\n" },
    { id: "c", content: "# 丙\n[[丁]]" },
    { id: "d", content: "# 丁\n" },
    { id: "e", content: "# 戊\n独自" },
  ];
  const near = linkGraph(notes, 160, "a");
  assert.deepEqual(near.nodes.map((node) => node.id).sort(), ["a", "b"]);
  const alone = linkGraph(notes, 160, "e");
  assert.deepEqual(alone.nodes.map((node) => node.id), ["e"]);
});

test("nearby mode can expand a second hop", () => {
  const notes = [
    { id: "a", content: "# 甲\n[[乙]]" },
    { id: "b", content: "# 乙\n[[丙]]" },
    { id: "c", content: "# 丙\n" },
    { id: "d", content: "# 丁\n独自" },
  ];
  const one = linkGraph(notes, 160, "a", 1);
  assert.deepEqual(one.nodes.map((node) => node.id).sort(), ["a", "b"]);
  const two = linkGraph(notes, 160, "a", 2);
  assert.deepEqual(two.nodes.map((node) => node.id).sort(), ["a", "b", "c"]);
});

test("layout stays inside the canvas and pulls linked notes together", () => {
  const points = layoutGraph(
    [{ id: "a" }, { id: "b" }],
    [{ source: "a", target: "b" }],
    640,
    480,
  );
  assert.equal(points.length, 2);
  for (const point of points) {
    assert.ok(point.x >= 48 && point.x <= 592);
    assert.ok(point.y >= 48 && point.y <= 432);
  }
  const [first, second] = points;
  const distance = Math.hypot(first.x - second.x, first.y - second.y);
  assert.ok(distance < 220, `expected linked notes to sit together, got ${distance}`);
  const again = layoutGraph(
    [{ id: "a" }, { id: "b" }],
    [{ source: "a", target: "b" }],
    640,
    480,
  );
  assert.deepEqual(again, points);
});
