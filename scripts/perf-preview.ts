// Preview update cost for a one-character edit in a ~60k-character note.
// Usage: node --experimental-strip-types scripts/perf-preview.ts [src-root]
// With a src-root from an older checkout it measures the old full re-render.
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(process.argv[2] ?? "src");
const markdown = await import(pathToFileURL(path.join(root, "lib/notes/markdown.ts")).href);
let blocks: typeof import("../src/lib/notes/preview-blocks.ts") | null = null;
try {
  blocks = await import(pathToFileURL(path.join(root, "lib/notes/preview-blocks.ts")).href);
} catch {
  blocks = null;
}

function buildNote(target = 60_000): string {
  const parts: string[] = [];
  let i = 0;
  while (parts.join("").length < target) {
    i += 1;
    parts.push(`## 第 ${i} 节\n\n这是一段中文正文，带 **加粗**、\`code\`、[[笔记${i}]] 和公式 $a_${i}^2+b^2=c^2$。\n\n`);
    parts.push(`- [ ] 任务 ${i}\n- [x] 完成 ${i}\n\n`);
    if (i % 3 === 0) parts.push("```ts\nconst value = " + i + ";\nfunction f(x: number) {\n  return x * 2;\n}\n```\n\n");
    if (i % 4 === 0) parts.push("```mermaid\nflowchart LR\n  A" + i + " --> B" + i + "\n  B" + i + " --> C" + i + "\n```\n\n");
    if (i % 5 === 0) parts.push("$$\n\\int_0^1 x^" + i + " \\, dx = \\frac{1}{" + (i + 1) + "}\n$$\n\n");
    parts.push("> [!note] 提示\n> 引用里的内容 " + i + "\n\n");
  }
  return parts.join("");
}

const note = buildNote();
const edits = 40;
const at = Math.floor(note.length / 2);
const variants = Array.from({ length: edits }, (_, k) => note.slice(0, at) + "字".repeat(k + 1) + note.slice(at));

function time(run: (text: string) => void): { median: number; p95: number } {
  run(note); // warm up highlight.js / marked
  const samples = variants.map((text) => {
    const started = performance.now();
    run(text);
    return performance.now() - started;
  });
  samples.sort((a, b) => a - b);
  return { median: samples[Math.floor(samples.length / 2)], p95: samples[Math.floor(samples.length * 0.95)] };
}

const full = time((text) => markdown.renderMarkdown(text));
console.log(`note: ${note.length} chars`);
console.log(`full re-render per keystroke: median ${full.median.toFixed(1)} ms, p95 ${full.p95.toFixed(1)} ms`);
if (blocks) {
  const cache = blocks.createSectionCache();
  let last = { rendered: 0, reused: 0 };
  const inc = time((text) => {
    const result = blocks!.renderSections(text, { cache });
    last = { rendered: result.rendered, reused: result.reused };
  });
  console.log(
    `incremental per keystroke:   median ${inc.median.toFixed(1)} ms, p95 ${inc.p95.toFixed(1)} ms (last edit re-rendered ${last.rendered} of ${last.rendered + last.reused} blocks)`,
  );
}
