import assert from "node:assert/strict";
import { test } from "node:test";
import { renderMarkdown } from "./markdown.ts";
import {
  countTasks,
  ensureKatex,
  extractMath,
  renderMathSlot,
  scanFences,
  tameOpenFences,
  toggleTaskAt,
} from "./markdown-extra.ts";
import { isReadyMermaidSource } from "./mermaid-render.ts";

const checkboxes = (html: string) => (html.match(/class="task-toggle"/g) ?? []).length;

test("a lone backtick renders as a real backtick, not a look-alike", () => {
  const html = renderMarkdown("价格 ` 未闭合，后面 $x$ 和 [[笔记]] 照常");
  assert.match(html, /价格 ` 未闭合/);
  assert.doesNotMatch(html, /\u02cb/);
  assert.match(html, /wiki-link/);
  assert.match(html, /math-pending|katex/);
});

test("backtick runs of every length finish quickly", () => {
  for (const ticks of ["`", "``", "```", "````", "`".repeat(30)]) {
    const started = Date.now();
    const html = renderMarkdown(`前 ${ticks} 中 $a$ ${"字".repeat(20_000)}\n\n尾段`);
    assert.ok(Date.now() - started < 1500, `${ticks.length} ticks took too long`);
    assert.match(html, /尾段/);
  }
});

test("inline code still works next to stray ticks", () => {
  const html = renderMarkdown("a ` b `code` c");
  assert.match(html, /<code>/);
  assert.doesNotMatch(html, /\u02cb/);
});

test("an unfinished ``` fence does not swallow the rest of the note", () => {
  const html = renderMarkdown("开头\n\n```js\nconst a = 1;\n\n## 后面的标题\n\n- [ ] 任务\n");
  assert.match(html, /<h2[^>]*>后面的标题<\/h2>/);
  assert.match(html, /```js/);
  assert.equal(checkboxes(html), 1);
});

test("an unfinished ~~~ fence does not swallow the rest either", () => {
  const html = renderMarkdown("~~~python\nprint(1)\n\n## 标题\n");
  assert.match(html, /<h2[^>]*>标题<\/h2>/);
  assert.match(html, /~~~python/);
  assert.doesNotMatch(html, /<del>/);
});

test("a half-written mermaid block stays text until it closes", () => {
  const typing = renderMarkdown("```mermaid\nflowchart LR\n  A --> \n\n下一段");
  assert.doesNotMatch(typing, /class="mermaid"/);
  assert.match(typing, /下一段/);
  const done = renderMarkdown("```mermaid\nflowchart LR\n  A --> B\n```\n\n下一段");
  assert.match(done, /<pre class="mermaid" data-source="flowchart LR\n {2}A --&gt; B">/);
  assert.match(done, /<p>下一段<\/p>/);
});

test("mermaid waits for a diagram keyword before drawing", () => {
  assert.equal(isReadyMermaidSource("flow"), false);
  assert.equal(isReadyMermaidSource("graph TD\n A-->B"), true);
  assert.equal(isReadyMermaidSource("%% 注释\nflowchart LR"), false);
});

test("fences follow CommonMark closing rules", () => {
  const tilde = scanFences("~~~\n```\n$x$\n~~~\n$y$");
  assert.deepEqual(tilde.code, [true, true, true, true, false]);
  assert.deepEqual(tilde.unclosed, []);
  const longer = scanFences("````\n```\n````");
  assert.deepEqual(longer.code, [true, true, true]);
  const withInfo = scanFences("```\ncode\n```js\nmore");
  assert.deepEqual(withInfo.unclosed, [0, 2]);
  const inlineTicks = scanFences("``` a ` b\ntext");
  assert.deepEqual(inlineTicks.unclosed, []);
  assert.equal(tameOpenFences("```\n```"), "```\n```");
  assert.equal(tameOpenFences("  ```mermaid\nA"), "  \\`\\`\\`mermaid\nA");
});

test("math is not pulled out of ~~~ blocks or escaped dollars", () => {
  const fenced = extractMath("~~~\n$skip$\n```\n$also$\n~~~\n$keep$");
  assert.deepEqual(
    fenced.slots.map((slot) => slot.tex),
    ["keep"],
  );
  const money = extractMath("原价 \\$5，现价 \\$3");
  assert.equal(money.slots.length, 0);
  const html = renderMarkdown("原价 \\$5，现价 \\$3");
  assert.match(html, /原价 \$5，现价 \$3/);
});

test("unclosed or empty math stays literal", () => {
  assert.equal(extractMath("只有 $ 一个").slots.length, 0);
  assert.equal(extractMath("$$ 没有结尾").slots.length, 0);
  assert.equal(extractMath("$$").slots.length, 0);
  assert.equal(extractMath("$a\nb$").slots.length, 0);
});

test("broken TeX renders without throwing", async () => {
  await ensureKatex();
  const html = renderMathSlot({ id: "x", display: false, tex: "\\frac{1}{" });
  assert.equal(typeof html, "string");
  const rendered = renderMarkdown("坏公式 $\\frac{1}{$ 之后");
  assert.match(rendered, /之后/);
});

test("task numbers match the checkboxes the preview draws", () => {
  const source = [
    "- [ ] 一",
    "```",
    "- [ ] 代码里的不是任务",
    "```",
    "1. [ ] 二",
    "> - [ ] 三",
    "- [x] 四",
  ].join("\n");
  const html = renderMarkdown(source);
  assert.equal(countTasks(source), checkboxes(html));
  assert.equal(countTasks(source), 4);
  const toggled = toggleTaskAt(source, 1);
  assert.match(toggled, /1\. \[x\] 二/);
  assert.match(toggled, /代码里的不是任务/);
  assert.match(toggled, /- \[ \] 代码里的不是任务/);
  assert.match(toggleTaskAt(source, 3), /- \[ \] 四/);
  assert.equal(toggleTaskAt(source, 9), source);
});

test("sanitizing drops handlers from tags but keeps the words in text", async () => {
  const { sanitizeRenderedHtml } = await import("./markdown.ts");
  const html = renderMarkdown("```mermaid\nflowchart LR\n  A[onclick=go] --> B[javascript: x]\n```\n\n写 onload=1 和 javascript: 文字");
  assert.match(html, /A\[onclick=go\]/);
  assert.match(html, /B\[javascript: x\]/);
  assert.match(html, /写 onload=1 和 javascript: 文字/);
  const cleaned = sanitizeRenderedHtml(
    '<a href="jav&#x61;script:1" onclick="x" title="onclick=y">t</a><img src=x onerror=alert(1)><svg onload="1">',
  );
  assert.equal(cleaned, '<a title="onclick=y">t</a><img src=x><svg>');
  assert.doesNotMatch(renderMarkdown("[x](javascript:alert(1))"), /href/);
});
