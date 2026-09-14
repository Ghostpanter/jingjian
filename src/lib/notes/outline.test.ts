import assert from "node:assert/strict";
import { test } from "node:test";
import { extractHeadings, headingIdFor, slugifyHeading } from "./outline.ts";

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
