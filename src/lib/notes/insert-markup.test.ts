import assert from "node:assert/strict";
import { test } from "node:test";
import { looksLikeUrl, normalizeHref, wrapAsMarkup } from "./insert-markup.ts";

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
