import assert from "node:assert/strict";
import { test } from "node:test";
import { extractHeadings, headingIdFor, headingSeedBefore, slugifyHeading } from "./outline.ts";

test("slugify keeps chinese and de-dupes ids", () => {
  assert.equal(slugifyHeading("窗边的风"), "窗边的风");
  const seen = new Map<string, number>();
  assert.equal(headingIdFor("窗边的风", seen), "窗边的风");
  assert.equal(headingIdFor("窗边的风", seen), "窗边的风-2");
});

test("extractHeadings skips fenced code and records offsets", () => {
  const source = `# 欢迎

前言。

\`\`\`md
# 假标题
\`\`\`

## 常用操作

正文
`;
  const headings = extractHeadings(source);
  assert.equal(headings.length, 2);
  assert.equal(headings[0].text, "欢迎");
  assert.equal(headings[0].level, 1);
  assert.equal(headings[0].id, "欢迎");
  assert.equal(headings[1].text, "常用操作");
  assert.equal(source.slice(headings[0].offset, headings[0].offset + 4), "# 欢迎");
});

test("extractHeadings allows up to three leading spaces like CommonMark", () => {
  const source = "  ## 缩进标题\n\n# 顶格\n";
  const headings = extractHeadings(source);
  assert.equal(headings.length, 2);
  assert.equal(headings[0].text, "缩进标题");
  assert.equal(headings[0].level, 2);
  assert.equal(headings[1].text, "顶格");
  assert.equal(headings[1].level, 1);
});

test("headingSeedBefore ignores a heading line cut in the middle", () => {
  const source = "# Hello World\n\n# Hello\n";
  const cut = source.indexOf("World");
  const seed = headingSeedBefore(source, cut);
  assert.equal(seed.get("hello"), undefined);
  assert.equal(seed.get("hello-world"), undefined);
  // Full line before cut still counts
  const afterFirst = source.indexOf("\n") + 1;
  const seed2 = headingSeedBefore(source, afterFirst);
  assert.equal(seed2.get("hello-world"), 1);
});

test("extractHeadings recognizes setext headings like the preview", () => {
  const source = "Title\n=====\n\nSubtitle\n-----\n\n# ATX\n";
  const headings = extractHeadings(source);
  assert.equal(headings.length, 3);
  assert.equal(headings[0].text, "Title");
  assert.equal(headings[0].level, 1);
  assert.equal(headings[0].id, "title");
  assert.equal(headings[1].text, "Subtitle");
  assert.equal(headings[1].level, 2);
  assert.equal(headings[2].text, "ATX");
});
