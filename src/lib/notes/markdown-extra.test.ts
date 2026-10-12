import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.ts";
import {
  countTasks,
  countTasksBefore,
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

test("embed tasks and headings do not steal parent task indices", () => {
  const src = "- [ ] 父1\n\n![[乙]]\n\n- [ ] 父2\n";
  const html = renderMarkdown(src, [
    { id: "b", content: "# 乙\n\n- [ ] 嵌套任务\n\n## 小标题\n" },
  ]);
  assert.equal((html.match(/task-toggle/g) ?? []).length, 2);
  assert.match(html, /☐|☑/);
  assert.doesNotMatch(html, /<h1[^>]*>乙<\/h1>/);
  assert.doesNotMatch(html, /<h2[^>]*>小标题<\/h2>/);
  assert.match(html, /嵌套任务/);
  assert.match(toggleTaskAt(src, 1), /- \[x\] 父2/);
});

test("countTasksBefore ignores tasks inside a fence that spans the cut", () => {
  const source = [
    "- [ ] before",
    "```",
    "- [ ] inside",
    "- [ ] inside2",
    "still fence",
    "```",
    "- [ ] after",
  ].join("\n");
  // Cut in the middle of the fence (after "inside\n")
  const cut = source.indexOf("inside2");
  assert.equal(countTasksBefore(source, cut), 1);
  assert.equal(countTasksBefore(source, 0), 0);
  assert.equal(countTasksBefore(source, source.length), 2);
});

test("embed flatten leaves fenced sample tasks and headings alone", () => {
  const src = "![[真标题]]\n";
  const html = renderMarkdown(src, [
    {
      id: "s",
      content: [
        "# 真标题",
        "",
        "- [ ] 真任务",
        "",
        "```md",
        "# 代码里的标题",
        "- [ ] 代码里的任务",
        "```",
      ].join("\n"),
    },
  ]);
  assert.equal((html.match(/task-toggle/g) ?? []).length, 0);
  assert.match(html, /☐|☑/);
  assert.match(html, /# 代码里的标题/);
  assert.match(html, /代码里的任务/);
  assert.match(html, /\[ \]/); // fence sample keeps markdown checkbox syntax
  assert.doesNotMatch(html, /<h1[^>]*>真标题<\/h1>/);
});

test("malformed jingjian-wiki percent encoding does not crash preview", () => {
  const html = renderMarkdown("[坏链](jingjian-wiki://%E0%A4%A)");
  assert.match(html, /class="wiki-link"/);
  assert.match(html, /坏链/);
});

test("CRLF notes still count and toggle tasks", () => {
  const src = "- [ ] a\r\n- [x] b\r\n";
  assert.equal(countTasks(src), 2);
  assert.equal(countTasksBefore(src, src.indexOf("- [x] b")), 1);
  const flipped = toggleTaskAt(src, 0);
  assert.match(flipped, /- \[x\] a/);
  assert.equal(countTasks(flipped), 2);
});

test("CRLF fenced closers are recognized so tasks after a fence count", () => {
  const src = "```\r\n- [ ] inside\r\n```\r\n- [ ] after\r\n";
  assert.equal(countTasks(src), 1);
  assert.match(toggleTaskAt(src, 0), /- \[x\] after/);
});
