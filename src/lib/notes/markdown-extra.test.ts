import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.ts";
import {
  countTasks,
  ensureKatex,
  extractFootnotes,
  extractMath,
  findNoteByTitle,
  katexReady,
  parseCalloutOpen,
  toggleTaskAt,
} from "./markdown-extra.ts";
import type { Note } from "./types.ts";

test("extracts inline and display math outside fences", () => {
  const extracted = extractMath("见 $a+b$ 与\n```\n$skip$\n```\n$$c$$\n");
  assert.equal(extracted.slots.length, 2);
  assert.equal(extracted.slots[0]?.tex, "a+b");
  assert.equal(extracted.slots[1]?.display, true);
  assert.match(extracted.source, /```\n\$skip\$\n```/);
});

test("math and wiki stay literal inside inline code", () => {
  const extracted = extractMath("code `$a+b$` and $c$");
  assert.equal(extracted.slots.length, 1);
  assert.equal(extracted.slots[0]?.tex, "c");
  const html = renderMarkdown("见 `$E=mc^2$` 与 [[笔记]] 和 `[[跳过]]`");
  assert.match(html, /<code>\$E=mc\^2\$<\/code>/);
  assert.match(html, /class="wiki-link"/);
  assert.match(html, /<code>\[\[跳过\]\]<\/code>/);
});

test("renders math, callouts and footnotes", async () => {
  const source = "公式 $E=mc^2$\n\n> [!warning] 小心\n> 别删库\n\n见脚注[^1]\n\n[^1]: 说明文字\n";
  const first = renderMarkdown(source);
  if (!katexReady()) {
    assert.match(first, /math-pending/);
    assert.doesNotMatch(first, /class="katex/);
  }
  assert.match(first, /callout-warning/);
  assert.match(first, /小心/);
  assert.match(first, /fn-ref/);
  assert.match(first, /说明文字/);
  await ensureKatex();
  const html = renderMarkdown(source);
  assert.match(html, /katex/);
});

test("embeds another note instead of an image", () => {
  const html = renderMarkdown("见 ![[乙]]\n", [
    { id: "b", content: "# 乙\n\n嵌进来的句子" },
  ]);
  assert.match(html, /嵌进来的句子/);
  assert.doesNotMatch(html, /<img/);
});

test("wiki links and task checkboxes", () => {
  const html = renderMarkdown("见 [[数据库速查|速查]]\n\n- [ ] 一\n- [x] 二\n");
  assert.match(html, /class="wiki-link"/);
  assert.match(html, /data-wiki="数据库速查"/);
  assert.match(html, /data-task="0"/);
  assert.match(html, /data-task="1"/);
  assert.match(html, /code-copy|wiki-link/);
});

test("code block has a copy button", () => {
  const html = renderMarkdown("```js\nconst n = 1;\n```\n");
  assert.match(html, /class="code-copy"/);
});

test("toggleTaskAt flips the nth checkbox", () => {
  const src = "- [ ] a\n- [x] b\n";
  assert.equal(countTasks(src), 2);
  assert.equal(toggleTaskAt(src, 0), "- [x] a\n- [x] b\n");
  assert.equal(toggleTaskAt(src, 1), "- [ ] a\n- [ ] b\n");
});

test("parseCalloutOpen reads obsidian syntax", () => {
  const parsed = parseCalloutOpen("<p>[!tip] 提示</p>\n<p>正文</p>");
  assert.equal(parsed?.kind, "tip");
  assert.equal(parsed?.title, "提示");
  assert.match(parsed?.rest ?? "", /正文/);
  const withBreak = parseCalloutOpen("<p>[!warning] 小心<br>别删库</p>");
  assert.equal(withBreak?.kind, "warning");
  assert.equal(withBreak?.title, "小心");
  assert.match(withBreak?.rest ?? "", /别删库/);
});

test("findNoteByTitle matches first line", () => {
  const notes: Note[] = [
    { id: "1", content: "# 数据库速查文档\n\nbody", createdAt: 1, updatedAt: 1 },
  ];
  assert.equal(findNoteByTitle(notes, "数据库速查文档")?.id, "1");
  assert.equal(findNoteByTitle(notes, "没有") , null);
});

test("extractFootnotes strips definitions", () => {
  const result = extractFootnotes("hi [^a]\n\n[^a]: body\n");
  assert.equal(result.notes[0]?.body, "body");
  assert.match(result.source, /@@FNREF0@@/);
  assert.doesNotMatch(result.source, /\[\^a\]:/);
});
