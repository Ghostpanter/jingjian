import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown, sanitizeHref, sanitizeInlineHtml } from "./markdown.ts";

test("highlights fenced code by language", () => {
  const html = renderMarkdown("```js\nconst n = 1;\n```\n");
  assert.match(html, /code-block/);
  assert.match(html, /hljs/);
  assert.match(html, /javascript|hljs-keyword|hljs-number/);
});

test("renders mermaid fences as mermaid blocks", () => {
  const html = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```\n");
  assert.match(html, /class="mermaid"/);
  assert.match(html, /flowchart LR/);
  assert.doesNotMatch(html, /hljs/);
});

test("keeps safe external links and images", () => {
  const html = renderMarkdown(
    "[静笺](https://example.com) 和 ![图](https://example.com/a.png)",
  );
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /src="https:\/\/example.com\/a.png"/);
});

test("drops javascript urls", () => {
  assert.equal(sanitizeHref("javascript:alert(1)"), null);
  const html = renderMarkdown("[x](javascript:alert(1))");
  assert.doesNotMatch(html, /javascript:/);
});

test("headings get stable ids for outline and scroll", () => {
  const html = renderMarkdown("# 欢迎\n\n## 常用操作\n\n# 欢迎\n");
  assert.match(html, /id="欢迎"/);
  assert.match(html, /id="常用操作"/);
  assert.match(html, /id="欢迎-2"/);
});

test("keeps underline and other safe inline html", () => {
  assert.equal(sanitizeInlineHtml("<u>"), "<u>");
  assert.equal(sanitizeInlineHtml("</U>"), "</u>");
  assert.equal(sanitizeInlineHtml("<br>"), "<br />");
  assert.equal(sanitizeInlineHtml('<img src=x onerror=alert(1)>'), "");
  const html = renderMarkdown("这是 <u>强调</u> 与 <mark>高亮</mark>。");
  assert.match(html, /<u>强调<\/u>/);
  assert.match(html, /<mark>高亮<\/mark>/);
  const unsafe = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(1)</script>');
  assert.doesNotMatch(unsafe, /onerror/);
  assert.doesNotMatch(unsafe, /<script/i);
});
