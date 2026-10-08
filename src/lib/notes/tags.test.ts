import assert from "node:assert/strict";
import { test } from "node:test";
import { libraryTags, replaceTag, stripTag, tagMatches, tagsInContent } from "./tags.ts";

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

test("stripTag removes that tag from prose and front matter", () => {
  const source = "---\ntags:\n  - 读书\n  - 旅行\n---\n\n见 #读书 与 `#读书`\n```\n#读书\n```\n还有 #读书";
  const next = stripTag(source, "读书");
  assert.match(next, /见 与 `#读书`/);
  assert.match(next, /```\n#读书\n```/);
  assert.match(next, /- 旅行/);
  assert.doesNotMatch(next, /- 读书/);
  assert.doesNotMatch(next, /还有 #读书/);
  assert.equal(stripTag("见 #写作 和 #写作/草稿", "写作"), "见 和 #写作/草稿");
  assert.equal(stripTag("---\ntags: [读书, 旅行]\n---\n\n正文", "读书"), "---\ntags: [旅行]\n---\n正文");
  assert.equal(stripTag("---\ntags: [读书]\n---\n\n正文 #读书", "读书"), "正文");
  const kept = "见 #旅行";
  assert.equal(stripTag(kept, "读书"), kept);
});

test("replaceTag renames the exact tag and leaves children and code", () => {
  assert.equal(replaceTag("见 #读书 和 #写作/草稿", "读书", "阅历"), "见 #阅历 和 #写作/草稿");
  assert.equal(
    replaceTag("---\ntags: [读书, 旅行]\n---\n\n#读书", "读书", "阅历"),
    "---\ntags: [阅历, 旅行]\n---\n\n#阅历",
  );
  assert.equal(replaceTag("见 `#读书`", "读书", "阅历"), "见 `#读书`");
  assert.equal(replaceTag("见 #读书", "读书", "读书"), "见 #读书");
});
