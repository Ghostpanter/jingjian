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

test("converts tables ordered lists and footnotes", () => {
  const md = htmlToMarkdown(`
    <table><tr><th>甲</th><th>乙</th></tr><tr><td>1</td><td>2</td></tr></table>
    <ol><li>第一</li><li>第二</li></ol>
    <p>见注<a href="#fn1" epub:type="noteref">1</a></p>
    <aside id="fn1" epub:type="footnote">补充说明</aside>
  `);
  assert.match(md, /\| 甲 \| 乙 \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| 1 \| 2 \|/);
  assert.match(md, /^1\. 第一/m);
  assert.match(md, /^2\. 第二/m);
  assert.match(md, /\[\^1\]/);
  assert.match(md, /\[\^1\]: 补充说明/);
});

test("keeps tables inside a wrapping div and poem line breaks", () => {
  const md = htmlToMarkdown(
    "<div><table><tr><td>春</td><td>秋</td></tr></table><p>床前明月光<br/>疑是地上霜</p></div>",
  );
  assert.match(md, /\| 春 \| 秋 \|/);
  assert.match(md, /床前明月光 {2}\n疑是地上霜/);
});
