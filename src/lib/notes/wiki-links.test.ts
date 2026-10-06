import assert from "node:assert/strict";
import { test } from "node:test";
import { noteLinks, unlinkedMentions, wikiHits } from "./wiki-links.ts";

test("wiki hits skip fenced and inline code, and keep the link target", () => {
  const hits = wikiHits("见 [[甲|链接]] 与 `[[乙]]`\n```\n[[丙]]\n```\n还有 [[甲#节]]");
  assert.deepEqual(
    hits.map((hit) => hit.target),
    ["甲", "甲"],
  );
});

test("incoming notes and outgoing targets resolve by title", () => {
  const notes = [
    { id: "a", content: "# 甲\n\n指向 [[乙]]。" },
    { id: "b", content: "# 乙\n\n回到 [[甲]]，以及 [[没有]]。" },
    { id: "c", content: "# 丙\n\n也提到 [[甲]]，再说一次 [[甲]]。" },
  ];
  const links = noteLinks(notes, "a");
  assert.equal(links.outgoing.length, 1);
  assert.equal(links.outgoing[0]?.target, "乙");
  assert.equal(links.outgoing[0]?.id, "b");
  assert.equal(links.incoming.length, 2);
  assert.equal(links.incoming.find((item) => item.id === "c")?.count, 2);
  const fromB = noteLinks(notes, "b");
  assert.equal(fromB.outgoing.find((item) => item.target === "没有")?.id, null);
  assert.equal(fromB.incoming.some((item) => item.id === "b"), false);
});

test("aliases resolve both ways and plain titles show up as unlinked", () => {
  const notes = [
    { id: "a", content: "---\naliases:\n  - 甲的别名\n---\n# 甲\n\n这里写了乙的笔记，但没有双链。" },
    { id: "b", content: "# 乙的笔记\n\n见 [[甲的别名]]。" },
  ];
  const fromA = noteLinks(notes, "a");
  assert.equal(fromA.incoming[0]?.id, "b");
  const fromB = noteLinks(notes, "b");
  assert.equal(fromB.outgoing[0]?.id, "a");
  const mentions = unlinkedMentions(notes, "a");
  assert.equal(mentions[0]?.id, "b");
  assert.equal(unlinkedMentions(notes, "b").length, 0);
});
