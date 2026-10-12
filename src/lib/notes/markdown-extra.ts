import { escapeHtml } from "./escape-html.ts";
import { bodyAfterFrontMatter, firstLineTitle, noteAliases } from "./format.ts";
import { titleIndex } from "./wiki-links.ts";
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

// restored through katexReady
export function katexReady(): boolean {
  return false;
}
