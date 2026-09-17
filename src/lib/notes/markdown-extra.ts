import katex from "katex";
import { escapeHtml } from "./escape-html.ts";
import { firstLineTitle } from "./format.ts";
import type { Note } from "./types.ts";

export type MathSlot = { id: string; display: boolean; tex: string };

const FENCE_LINE = /^(```|~~~)/;

function splitFences(source: string): { code: boolean; text: string }[] {
  const lines = source.split("\n");
  const parts: { code: boolean; text: string }[] = [];
  let fence: string | null = null;
  let buf: string[] = [];
  const flush = (code: boolean) => {
    if (buf.length === 0 && parts.length > 0) return;
    parts.push({ code, text: buf.join("\n") });
    buf = [];
  };
  for (const line of lines) {
    const open = FENCE_LINE.exec(line);
    if (fence) {
      buf.push(line);
      if (line.startsWith(fence)) {
        flush(true);
        fence = null;
      }
      continue;
    }
    if (open) {
      flush(false);
      fence = open[1];
      buf.push(line);
      continue;
    }
    buf.push(line);
  }
  flush(Boolean(fence));
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
      if (end !== -1) {
        parts.push({ code: true, text: chunk.slice(i, end + n) });
        i = end + n;
        continue;
      }
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

export function renderMathSlot(slot: MathSlot): string {
  try {
    const html = katex.renderToString(slot.tex, {
      displayMode: slot.display,
      throwOnError: false,
      output: "html",
    });
    return slot.display ? `<div class="math-block">${html}</div>` : html;
  } catch {
    return escapeHtml(slot.display ? `$$${slot.tex}$$` : `$${slot.tex}$`);
  }
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
    chunk.replace(/\[\[([^\]|#]+)(?:\|([^\]]+))?\]\]/g, (_all, target: string, alias?: string) => {
      const title = target.trim();
      if (!title) return _all;
      const label = (alias ?? title).trim() || title;
      return `[${label}](jingjian-wiki://${encodeURIComponent(title)})`;
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

export function toggleTaskAt(source: string, index: number): string {
  const lines = source.split("\n");
  let seen = 0;
  return lines
    .map((line) => {
      const match = /^(\s*[-*+][ \t]+)\[([ xX])\]([ \t].*)?$/.exec(line);
      if (!match) return line;
      if (seen !== index) {
        seen += 1;
        return line;
      }
      seen += 1;
      const next = match[2] === " " ? "x" : " ";
      return `${match[1]}[${next}]${match[3] ?? ""}`;
    })
    .join("\n");
}

export function countTasks(source: string): number {
  return source.split("\n").filter((line) => /^\s*[-*+][ \t]+\[[ xX]\]/.test(line)).length;
}

export function findNoteByTitle(notes: Note[], title: string): Note | null {
  const key = title.trim().toLowerCase();
  if (!key) return null;
  const exact = notes.find((note) => firstLineTitle(note.content).toLowerCase() === key);
  if (exact) return exact;
  return (
    notes.find((note) => firstLineTitle(note.content).toLowerCase().includes(key)) ?? null
  );
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
