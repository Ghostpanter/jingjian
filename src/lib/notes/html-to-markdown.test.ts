import assert from "node:assert/strict";
import { test } from "node:test";
import { htmlToMarkdown } from "./html-to-markdown.ts";

test("converts headings paragraphs and emphasis", () => {
  const md = htmlToMarkdown(
    "<h1>窗边</h1><p>下午的光线，<strong>很亮</strong>。</p>",
  );
  assert.match(md, /^# 窗边/m);
  assert.match(md, /\*\*很亮\*\*/);
});

test("converts lists links and images", () => {
  const md = htmlToMarkdown(
    '<ul><li>一条</li></ul><p><a href="https://example.com">静笺</a></p><p><img src="cover.png" alt="封面"/></p>',
  );
  assert.match(md, /^- 一条/m);
  assert.match(md, /\[静笺\]\(https:\/\/example.com\)/);
  assert.match(md, /!\[封面\]\(cover.png\)/);
});
