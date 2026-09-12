import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown, sanitizeHref } from "./markdown.ts";

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
