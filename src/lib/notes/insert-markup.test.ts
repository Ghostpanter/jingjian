import assert from "node:assert/strict";
import { test } from "node:test";
import {
  indentLines,
  insertTable,
  looksLikeUrl,
  normalizeHref,
  setHeading,
  toggleOrderedList,
  toggleQuote,
  toggleTaskList,
  toggleUnorderedList,
  wrapAsMarkup,
  wrapFence,
  wrapInline,
} from "./insert-markup.ts";

test("normalizes bare domains and www", () => {
  assert.equal(normalizeHref("www.example.com"), "https://www.example.com");
  assert.equal(normalizeHref("example.com/a"), "https://example.com/a");
  assert.equal(normalizeHref("https://ok.test"), "https://ok.test");
});

test("wraps selection as markdown link or image", () => {
  const link = wrapAsMarkup("看 静笺 文档", 2, 4, "静笺", "https://example.com", false);
  assert.equal(link.value, "看 [静笺](https://example.com) 文档");
  const image = wrapAsMarkup("", 0, 0, "封面", "https://example.com/a.png", true);
  assert.equal(image.value, "![封面](https://example.com/a.png)");
});

test("detects pasteable urls", () => {
  assert.equal(looksLikeUrl("https://github.com"), true);
  assert.equal(looksLikeUrl("普通文字"), false);
});

test("wraps and unwraps bold, leaving italic alone", () => {
  const wrapped = wrapInline("看 静笺 文档", 2, 4, "**");
  assert.equal(wrapped.value, "看 **静笺** 文档");
  assert.equal(wrapped.start, 4);
  assert.equal(wrapped.end, 6);
  const unwrapped = wrapInline(wrapped.value, wrapped.start, wrapped.end, "**");
  assert.equal(unwrapped.value, "看 静笺 文档");
  const empty = wrapInline("ab", 1, 1, "**");
  assert.equal(empty.value, "a****b");
  assert.equal(empty.start, 3);
  assert.equal(empty.end, 3);
});

test("italic wrap does not unwrap surrounding bold", () => {
  const italic = wrapInline("**静笺**", 2, 4, "*");
  assert.equal(italic.value, "***静笺***");
  assert.equal(italic.start, 3);
  assert.equal(italic.end, 5);
});

test("setHeading replaces atx markers and Ctrl+0 strips them", () => {
  const h2 = setHeading("# 标题\n下一段", 0, 0, 2);
  assert.equal(h2.value, "## 标题\n下一段");
  const para = setHeading("## 标题", 0, 4, 0);
  assert.equal(para.value, "标题");
  const multi = setHeading("一段\n二段", 0, 6, 3);
  assert.equal(multi.value, "### 一段\n### 二段");
});

test("toggles quote, lists and tasks", () => {
  assert.equal(toggleQuote("摘录", 0, 2).value, "> 摘录");
  assert.equal(toggleQuote("> 摘录", 0, 4).value, "摘录");
  assert.equal(toggleUnorderedList("一条", 0, 2).value, "- 一条");
  assert.equal(toggleUnorderedList("- 一条", 0, 4).value, "一条");
  assert.equal(toggleOrderedList("一条\n二条", 0, 6).value, "1. 一条\n2. 二条");
  assert.equal(toggleOrderedList("1. 一条\n2. 二条", 0, 12).value, "一条\n二条");
  assert.equal(toggleTaskList("待办", 0, 2).value, "- [ ] 待办");
  assert.equal(toggleTaskList("- [x] 待办", 0, 8).value, "待办");
});

test("indents and outdents selected lines", () => {
  const in2 = indentLines("- 一项\n  - 子项", 0, 12, 1);
  assert.equal(in2.value, "  - 一项\n    - 子项");
  const out = indentLines(in2.value, 0, in2.value.length, -1);
  assert.equal(out.value, "- 一项\n  - 子项");
  assert.equal(indentLines("一项", 0, 2, -1).value, "一项");
});

test("wraps a fence and inserts a table", () => {
  const fence = wrapFence("const n = 1;", 0, 12);
  assert.equal(fence.value, "```\nconst n = 1;\n```");
  assert.equal(fence.start, 4);
  assert.equal(fence.end, 16);
  const mid = wrapFence("上\n下", 2, 2);
  assert.equal(mid.value, "上\n```\n\n```\n下");
  const table = insertTable("前文", 2, 2);
  assert.match(table.value, /前文\n\|  \|  \|/);
  assert.match(table.value, /\| --- \| --- \|/);
});
