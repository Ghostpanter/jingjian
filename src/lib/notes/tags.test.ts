import assert from "node:assert/strict";
import { test } from "node:test";
import { libraryTags, tagMatches, tagsInContent } from "./tags.ts";

test("inline tags skip headings, code, urls, and bare numbers", () => {
  const tags = tagsInContent(
    "# 标题\n见 #读书 与 `#不要`\nhttps://example.com/page#section\n#2024\n```\n#代码\n```\n嵌套 #写作/草稿",
  );
  assert.deepEqual([...tags.keys()], ["读书", "写作/草稿"]);
});

test("frontmatter tags merge with inline tags, case-insensitively", () => {
  const tags = tagsInContent("---\ntags:\n  - Alpha\n  - beta/child\n---\n\n再说 #alpha 和 #旅行");
  assert.deepEqual([...tags.keys()], ["alpha", "beta/child", "旅行"]);
  assert.equal(tags.get("alpha"), "Alpha");
});

test("library counts notes and a parent tag includes children", () => {
  const index = libraryTags([
    { id: "a", content: "# 甲\n\n#读书" },
    { id: "b", content: "---\ntags: [读书, 写作/草稿]\n---\n" },
    { id: "c", content: "没有标签" },
  ]);
  assert.equal(index.tags.find((tag) => tag.key === "读书")?.count, 2);
  assert.equal(tagMatches(index.keysByNote.get("b") ?? [], "写作"), true);
  assert.equal(tagMatches(index.keysByNote.get("a") ?? [], "写作"), false);
  assert.equal(tagMatches(index.keysByNote.get("c") ?? [], "读书"), false);
});
