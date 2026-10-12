import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.ts";
import { countTasks, toggleTaskAt } from "./markdown-extra.ts";
import { createSectionCache, renderSections, splitSections } from "./preview-blocks.ts";

const NOTE = [
  "# 标题",
  "",
  "第一段，带 `code` 和 $a^2$。",
  "",
  "- [ ] 任务一",
  "- [x] 任务二",
  "",
  "## 标题",
  "",
  "```js",
  "const a = 1;",
  "",
  "const b = 2;",
  "```",
  "",
  "$$",
  "x",
  "",
  "y",
  "$$",
  "",
  "```mermaid",
  "flowchart LR",
  "  A --> B",
  "```",
  "",
  "# 标题",
  "",
  "1. [ ] 任务三",
  "",
  "> [!note] 提示",
  "> 引用",
  "",
  "结尾。",
].join("\n");

const joined = (source: string, cache = createSectionCache()) =>
  renderSections(source, { cache }).sections.map((item) => item.entry.html).join("");

test("block rendering matches rendering the whole note", () => {
  assert.equal(joined(NOTE), renderMarkdown(NOTE));
});

test("blocks never split fenced code, $$ math or front matter", () => {
  const sections = splitSections(NOTE);
  const fence = sections.find((item) => item.text.includes("const a"));
  assert.ok(fence?.text.includes("const b"));
  const math = sections.find((item) => item.text.includes("$$\nx"));
  assert.ok(math?.text.includes("y\n$$"));
  const front = splitSections("---\ntitle: 甲\n\ntags: [a]\n---\n\n正文");
  assert.ok(front[0]?.text.includes("tags: [a]"));
  assert.equal(splitSections("见[^1]\n\n段落\n\n[^1]: 脚注").length, 1);
});

test("lists and quotes that continue after a blank line stay one block", () => {
  const sections = splitSections("- 一\n\n- 二\n\n  缩进续行\n\n> 引用\n>\n> 续\n\n段落");
  assert.equal(sections.length, 2);
  assert.ok(sections[1]?.text.startsWith("段落"));
  assert.equal(sections.map((item) => item.text).join(""), "- 一\n\n- 二\n\n  缩进续行\n\n> 引用\n>\n> 续\n\n段落");
});

test("a one-character edit re-renders only the changed block", () => {
  const cache = createSectionCache();
  const first = renderSections(NOTE, { cache });
  assert.equal(first.reused, 0);
  const edited = NOTE.replace("第一段", "第一段落");
  const second = renderSections(edited, { cache });
  assert.equal(second.rendered, 1);
  assert.equal(second.reused, first.sections.length - 1);
  const unchanged = second.sections.filter((item) => item.reused);
  for (const item of unchanged) {
    assert.ok(first.sections.some((old) => old.entry === item.entry), "reused blocks keep the same entry (and DOM)");
  }
  assert.equal(second.sections.map((item) => item.entry.html).join(""), renderMarkdown(edited));
});

test("task numbers stay global and shift when a task is added above", () => {
  const cache = createSectionCache();
  const html = joined(NOTE, cache);
  assert.match(html, /data-task="2"/);
  assert.equal((html.match(/task-toggle/g) ?? []).length, countTasks(NOTE));
  const added = NOTE.replace("- [x] 任务二", "- [x] 任务二\n- [ ] 新任务");
  const next = renderSections(added, { cache });
  const later = next.sections.find((item) => item.entry.text.includes("任务三"));
  assert.equal(later?.reused, false);
  assert.match(later?.entry.html ?? "", /data-task="3"/);
  const prose = next.sections.find((item) => item.entry.text.startsWith("结尾"));
  assert.equal(prose?.reused, true, "blocks without tasks are not re-rendered");
  assert.match(toggleTaskAt(added, 3), /1\. \[x\] 任务三/);
});

test("duplicate heading ids stay unique across blocks", () => {
  const cache = createSectionCache();
  const html = joined(NOTE, cache);
  assert.match(html, /id="标题"/);
  assert.match(html, /id="标题-2"/);
  assert.match(html, /id="标题-3"/);
  const renamed = NOTE.replace("## 标题", "## 别的");
  const next = renderSections(renamed, { cache });
  const html2 = next.sections.map((item) => item.entry.html).join("");
  assert.equal(html2, renderMarkdown(renamed));
  assert.match(html2, /id="标题-2"/);
});

test("embedded notes re-render when the other note changes", () => {
  const cache = createSectionCache();
  const source = "见 ![[乙]]\n\n别的段落";
  const one = renderSections(source, { cache, library: [{ id: "b", content: "# 乙\n\n旧句子" }], libraryVersion: 1 });
  assert.match(one.sections[0]?.entry.html ?? "", /旧句子/);
  const two = renderSections(source, { cache, library: [{ id: "b", content: "# 乙\n\n新句子" }], libraryVersion: 2 });
  assert.match(two.sections[0]?.entry.html ?? "", /新句子/);
  assert.equal(two.sections[1]?.reused, true);
});
