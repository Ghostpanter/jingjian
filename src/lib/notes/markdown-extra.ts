import { escapeHtml } from "./escape-html.ts";
import { bodyAfterFrontMatter, firstLineTitle, noteAliases } from "./format.ts";
import { titleIndex } from "./wiki-links.ts";
import type { Note } from "./types.ts";

export type MathSlot = { id: string; display: boolean; tex: string };

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

export type FenceScan = {
  lines: string[];
  /** true for the fence lines and the body of every fenced block that closes. */
  code: boolean[];
  /** Line numbers of fence openers that never close. */
  unclosed: number[];
};

/**
 * One pass over the note that finds CommonMark fenced code blocks.
 * A fence only counts when a closing line exists: an opener the user is still
 * typing stays prose, so it cannot swallow the rest of the note.
 */
export function scanFences(source: string): FenceScan {
  const lines = source.split("\n");
  const code = new Array<boolean>(lines.length).fill(false);
  const unclosed: number[] = [];
  // Shortest run per fence char already known to have no closer further down.
  const noCloser: Record<string, number> = { "`": Number.POSITIVE_INFINITY, "~": Number.POSITIVE_INFINITY };
  let i = 0;
  while (i < lines.length) {
    const open = FENCE_OPEN.exec(lines[i] ?? "");
    if (!open) {
      i += 1;
      continue;
    }
    const run = open[1] ?? "";
    const char = run[0] ?? "`";
    if (char === "`" && (open[2] ?? "").includes("`")) {
      i += 1;
      continue;
    }
    let close = -1;
    if (run.length < noCloser[char]) {
      const closeRe = new RegExp(`^ {0,3}${char === "`" ? "`" : "~"}{${run.length},}[ \\t]*$`);
      for (let j = i + 1; j < lines.length; j += 1) {
        if (closeRe.test(lines[j] ?? "")) {
          close = j;
          break;
        }
      }
    }
    if (close === -1) {
      noCloser[char] = Math.min(noCloser[char], run.length);
      unclosed.push(i);
      i += 1;
      continue;
    }
    for (let k = i; k <= close; k += 1) code[k] = true;
    i = close + 1;
  }
  return { lines, code, unclosed };
}

/**
 * Escape the marker of every fence that never closes, e.g. a half-typed
 * ```mermaid. Markdown would otherwise turn the whole rest of the note into
 * one code (or Mermaid) block on every keystroke. The escaped marker still
 * shows as real backticks.
 */
export function tameOpenFences(source: string): string {
  const scan = scanFences(source);
  if (scan.unclosed.length === 0) return source;
  const lines = [...scan.lines];
  for (const index of scan.unclosed) {
    lines[index] = (lines[index] ?? "").replace(
      /^( {0,3})(`{3,}|~{3,})/,
      (_, indent: string, run: string) => indent + run.replace(/./g, (c) => `\\${c}`),
    );
  }
  return lines.join("\n");
}

function splitFences(source: string): { code: boolean; text: string }[] {
  const { lines, code } = scanFences(source);
  const parts: { code: boolean; text: string }[] = [];
  let start = 0;
  for (let i = 1; i <= lines.length; i += 1) {
    if (i === lines.length || code[i] !== code[start]) {
      parts.push({ code: code[start] ?? false, text: lines.slice(start, i).join("\n") });
      start = i;
    }
  }
  return parts;
}

function splitInlineCode(chunk: string): { code: boolean; text: string }[] {
  const parts: { code: boolean; text: string }[] = [];
  let i = 0;
  while (i < chunk.length) {
    if (chunk[i] === "`") {
      let n = 1;
      while (chunk[i + n] === "`") n += 1;
      const fence = "`".repeat(n);
      const end = chunk.indexOf(fence, i + n);
      if (end !== -1 && end > i + n) {
        parts.push({ code: true, text: chunk.slice(i, end + n) });
        i = end + n;
        continue;
      }
      parts.push({ code: false, text: fence });
      i += n;
      continue;
    }
    const next = chunk.indexOf("`", i);
    const end = next === -1 ? chunk.length : next;
    if (end > i) parts.push({ code: false, text: chunk.slice(i, end) });
    if (next === -1) break;
    i = end;
  }
  return parts;
}

function mapProse(source: string, transform: (chunk: string) => string): string {
  return splitFences(source)
    .map((part) => {
      if (part.code) return part.text;
      return splitInlineCode(part.text)
        .map((inner) => (inner.code ? inner.text : transform(inner.text)))
        .join("");
    })
    .join("\n");
}

export function extractMath(source: string): { source: string; slots: MathSlot[] } {
  const slots: MathSlot[] = [];
  const next = mapProse(source, (chunk) => {
    let out = "";
    let i = 0;
    while (i < chunk.length) {
      if (chunk[i] === "\\" && chunk[i + 1] === "$") {
        out += "\\$";
        i += 2;
        continue;
      }
      if (chunk.startsWith("$$", i)) {
        const end = chunk.indexOf("$$", i + 2);
        if (end !== -1) {
          const id = `@@MATH${slots.length}@@`;
          slots.push({ id, display: true, tex: chunk.slice(i + 2, end) });
          out += id;
          i = end + 2;
          continue;
        }
      }
      if (chunk[i] === "$" && chunk[i + 1] !== "$") {
        const end = chunk.indexOf("$", i + 1);
        if (end !== -1 && end > i + 1 && !chunk.slice(i + 1, end).includes("\n")) {
          const id = `@@MATH${slots.length}@@`;
          slots.push({ id, display: false, tex: chunk.slice(i + 1, end) });
          out += id;
          i = end + 1;
          continue;
        }
      }
      out += chunk[i];
      i += 1;
    }
    return out;
  });
  return { source: next, slots };
}

type KatexModule = typeof import("katex");
let katexMod: KatexModule | null = null;

export function katexReady(): boolean {
  return katexMod != null;
}

export async function ensureKatex(): Promise<void> {
  if (katexMod) return;
  katexMod = await import("katex");
}

function katexHtml(slot: MathSlot): string {
  if (!katexMod) {
    const shown = slot.display ? `$$${slot.tex}$$` : `$${slot.tex}$`;
    return `<span class="math-pending" data-display="${slot.display ? "1" : "0"}">${escapeHtml(shown)}</span>`;
  }
  try {
    const html = katexMod.renderToString(slot.tex, {
      displayMode: slot.display,
      throwOnError: false,
      output: "html",
    });
    return slot.display ? `<div class="math-block">${html}</div>` : html;
  } catch {
    return escapeHtml(slot.display ? `$$${slot.tex}$$` : `$${slot.tex}$`);
  }
}

export function renderMathSlot(slot: MathSlot): string {
  return katexHtml(slot);
}

export function upgradeMathNode(node: Element): void {
  if (!katexMod || !node.parentNode) return;
  const shown = (node.textContent ?? "").trim();
  const display = node.getAttribute("data-display") === "1";
  const tex = display ? shown.replace(/^\$\$/, "").replace(/\$\$$/, "") : shown.replace(/^\$/, "").replace(/\$$/, "");
  const html = katexHtml({ id: "", display, tex });
  const doc = node.ownerDocument ?? document;
  const wrap = doc.createElement("span");
  wrap.innerHTML = html;
  node.replaceWith(...wrap.childNodes);
}

export function upgradeMath(root: ParentNode): void {
  if (!katexMod) return;
  for (const node of root.querySelectorAll(".math-pending")) upgradeMathNode(node);
}

export function restoreMath(html: string, slots: MathSlot[]): string {
  let out = html;
  for (const slot of slots) {
    out = out.split(slot.id).join(renderMathSlot(slot));
  }
  return out;
}

export function expandWikiLinks(source: string): string {
  return mapProse(source, (chunk) =>
    chunk.replace(/(?<!!)\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_all, target: string, alias?: string) => {
      const title = target.trim();
      if (!title) return _all;
      const label = (alias ?? title).trim() || title;
      return `[${label}](jingjian-wiki://${encodeURIComponent(title)})`;
    }),
  );
}

const EMBED = /!\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;

/** Inline `![[笔记]]` as a quote. Nested embeds become ordinary links. */
export function expandNoteEmbeds(
  source: string,
  notes: { id: string; content: string }[],
): string {
  if (!source.includes("![[")) return source;
  const index = titleIndex(notes);
  const byId = new Map(notes.map((note) => [note.id, note.content]));
  return mapProse(source, (chunk) =>
    chunk.replace(EMBED, (all, raw: string) => {
      const title = String(raw).trim();
      if (!title) return all;
      const id = index.get(title.toLowerCase());
      if (!id) return `「没有 ${title}」`;
      const body = bodyAfterFrontMatter(byId.get(id) ?? "")
        .trim()
        .replace(EMBED, (_match, inner: string) => `[[${String(inner).trim()}]]`);
      const quoted = (body || title)
        .split("\n")
        .map((line) => `> ${line}`)
        .join("\n");
      return `\n\n> **${title}**\n>\n${quoted}\n\n`;
    }),
  );
}

export function extractFootnotes(source: string): {
  source: string;
  notes: { id: string; body: string }[];
} {
  const notes: { id: string; body: string }[] = [];
  const seen = new Map<string, number>();
  const withoutDefs = mapProse(source, (chunk) =>
    chunk.replace(/^\[\^([^\]]+)\]:\s*(.*)$/gm, (_all, id: string, body: string) => {
      const key = String(id).trim();
      if (!key) return _all;
      if (!seen.has(key)) {
        seen.set(key, notes.length);
        notes.push({ id: key, body: body.trim() });
      }
      return "";
    }),
  );
  if (notes.length === 0) return { source, notes };
  const withRefs = mapProse(withoutDefs, (chunk) =>
    chunk.replace(/\[\^([^\]]+)\]/g, (_all, id: string) => {
      const key = String(id).trim();
      const index = seen.get(key);
      if (index == null) return _all;
      return `@@FNREF${index}@@`;
    }),
  );
  return { source: withRefs.replace(/\n{3,}/g, "\n\n"), notes };
}

export function restoreFootnotes(html: string, notes: { id: string; body: string }[]): string {
  let out = html;
  notes.forEach((note, index) => {
    const n = index + 1;
    out = out.split(`@@FNREF${index}@@`).join(
      `<sup class="fn-ref"><a href="#fn-${escapeHtml(note.id)}">${n}</a></sup>`,
    );
  });
  if (notes.length === 0) return out;
  const items = notes
    .map(
      (note, index) =>
        `<li id="fn-${escapeHtml(note.id)}"><span class="fn-index">${index + 1}.</span> ${escapeHtml(note.body)}</li>`,
    )
    .join("");
  return `${out}<section class="footnotes"><ol>${items}</ol></section>`;
}

const TASK_LINE = /^((?:[ \t]*>)*[ \t]*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\]([ \t].*)?$/;

/** Lines that the preview shows as task checkboxes, in preview order (fenced code is skipped). */
function taskLines(source: string): { lines: string[]; tasks: number[] } {
  const { lines, code } = scanFences(source);
  const tasks: number[] = [];
  lines.forEach((line, index) => {
    if (!code[index] && TASK_LINE.test(line)) tasks.push(index);
  });
  return { lines, tasks };
}

export function toggleTaskAt(source: string, index: number): string {
  const { lines, tasks } = taskLines(source);
  const at = tasks[index];
  if (at === undefined) return source;
  const match = TASK_LINE.exec(lines[at] ?? "");
  if (!match) return source;
  const next = match[2] === " " ? "x" : " ";
  lines[at] = `${match[1]}[${next}]${match[3] ?? ""}`;
  return lines.join("\n");
}

export function countTasks(source: string): number {
  return taskLines(source).tasks.length;
}

export function findNoteByTitle(notes: Note[], title: string): Note | null {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  const exact = notes.find((note) => firstLineTitle(note.content).toLowerCase() === key);
  if (exact) return exact;
  const alias = notes.find((note) =>
    noteAliases(note.content).some((item) => item.trim().toLowerCase() === key),
  );
  if (alias) return alias;
  return notes.find((note) => firstLineTitle(note.content).toLowerCase().includes(key)) ?? null;
}

const CALLOUT_TITLE: Record<string, string> = {
  note: "注释",
  tip: "提示",
  info: "说明",
  warning: "注意",
  caution: "注意",
  danger: "危险",
  success: "完成",
  question: "问题",
  abstract: "摘要",
  todo: "待办",
  example: "示例",
  quote: "引用",
  bug: "缺陷",
  failure: "失败",
};

export function calloutLabel(kind: string): string {
  const key = kind.trim().toLowerCase();
  return CALLOUT_TITLE[key] || kind.trim() || "注释";
}

export function parseCalloutOpen(html: string): {
  kind: string;
  title: string;
  rest: string;
} | null {
  const match = html.match(
    /^<p>\s*\[!([a-zA-Z][\w-]*)\]([ \t]+[^\n<]*)?(?:\s*<br\s*\/?>\s*|\s*\n\s*|\s*<\/p>\s*)([\s\S]*)$/i,
  );
  if (!match) return null;
  const kind = match[1].toLowerCase();
  const title = (match[2] ?? "").trim() || calloutLabel(kind);
  const restRaw = match[3] ?? "";
  const consumed = html.slice(0, html.length - restRaw.length);
  const closedByPara = /<\/p>\s*$/i.test(consumed);
  let rest = restRaw;
  if (!closedByPara) {
    rest = rest.replace(/<\/p>\s*$/i, "").trim();
    rest = rest ? `<p>${rest}</p>` : "";
  }
  return { kind, title, rest };
}
