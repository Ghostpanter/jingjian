import { Marked } from "marked";
import { escapeHtml } from "./escape-html.ts";
import { displayLang, highlightCode } from "./highlight.ts";
import {
  expandNoteEmbeds,
  expandWikiLinks,
  extractFootnotes,
  extractMath,
  parseCalloutOpen,
  restoreFootnotes,
  restoreMath,
} from "./markdown-extra.ts";
import { headingIdFor } from "./outline.ts";

const marked = new Marked({
  gfm: true,
  breaks: true,
});

const headingSeen = new Map<string, number>();
let taskIndex = 0;

marked.use({
  renderer: {
    heading({ text, depth }) {
      const id = headingIdFor(String(text).replace(/<[^>]+>/g, ""), headingSeen);
      return `<h${depth} id="${escapeHtml(id)}">${text}</h${depth}>\n`;
    },
    html({ text }) {
      return sanitizeInlineHtml(text);
    },
    code({ text, lang }) {
      if (isMermaidBlock(lang, text)) {
        return `<div class="mermaid-block"><pre class="mermaid" data-source="${escapeHtml(text)}">${escapeHtml(text)}</pre></div>`;
      }
      const label = displayLang(lang);
      const highlighted = highlightCode(text, lang);
      const langAttr = label ? ` data-lang="${escapeHtml(label)}"` : "";
      const className = label ? ` class="hljs language-${escapeHtml(label)}"` : ' class="hljs"';
      return `<div class="code-block"${langAttr}><button type="button" class="code-copy">复制</button><pre><code${className}>${highlighted}</code></pre></div>`;
    },
    checkbox({ checked }) {
      const index = taskIndex;
      taskIndex += 1;
      return `<input type="checkbox" class="task-toggle" data-task="${index}"${checked ? " checked" : ""} />`;
    },
    blockquote({ tokens }) {
      const inner = this.parser.parse(tokens);
      const callout = parseCalloutOpen(inner.trim());
      if (!callout) return `<blockquote>${inner}</blockquote>\n`;
      return `<aside class="callout callout-${escapeHtml(callout.kind)}" data-callout="${escapeHtml(callout.kind)}"><p class="callout-title">${escapeHtml(callout.title)}</p>${callout.rest}</aside>\n`;
    },
    link({ href, title, text }) {
      const safe = sanitizeHref(href);
      if (!safe) return escapeHtml(text);
      if (safe.startsWith("jingjian-wiki://")) {
        const wiki = decodeURIComponent(safe.slice("jingjian-wiki://".length));
        return `<a class="wiki-link" href="#wiki" data-wiki="${escapeHtml(wiki)}">${escapeHtml(text)}</a>`;
      }
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<a href="${escapeHtml(safe)}"${titleAttr} target="_blank" rel="noreferrer noopener">${escapeHtml(text)}</a>`;
    },
    image({ href, title, text }) {
      const safe = sanitizeHref(href);
      if (!safe) return escapeHtml(text);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : "";
      return `<img src="${escapeHtml(safe)}" alt="${escapeHtml(text)}"${titleAttr} loading="lazy" referrerpolicy="no-referrer" />`;
    },
  },
});

const MERMAID_START =
  /^(graph\s|flowchart\s|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt\b|pie\s|mindmap\b|gitGraph|journey\b|C4Context|timeline\b|quadrantChart|sankey-beta|xychart-beta)/;

function isMermaidBlock(lang: string | undefined, text: string): boolean {
  const key = lang?.trim().toLowerCase() ?? "";
  if (key === "mermaid" || key === "mmd") return true;
  return !key && MERMAID_START.test(text.trimStart());
}

const SAFE_INLINE_TAG = /^<\/?(?:u|mark|sub|sup|kbd)>$/i;
const SAFE_BR = /^<br\s*\/?>$/i;

export function sanitizeInlineHtml(text: string): string {
  const token = text.trim();
  if (!token) return "";
  if (SAFE_BR.test(token)) return "<br />";
  if (SAFE_INLINE_TAG.test(token)) return token.toLowerCase();
  return "";
}

const OPEN_TICK = "\u02cb";

function breakTicks(count: number): string {
  return OPEN_TICK.repeat(count);
}

/**
 * marked's codespan rule is `/^(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/`.
 * One unmatched backtick makes that lazy match scan the rest of the note and
 * freeze the editor. Walk the source once and split only the runs that never
 * close, so inline code and fenced blocks stay intact.
 */
export function tameBackticks(source: string): string {
  let out = "";
  let i = 0;
  const n = source.length;
  while (i < n) {
    if (source[i] === "\\" && i + 1 < n) {
      out += source[i] + source[i + 1];
      i += 2;
      continue;
    }
    if (source[i] !== "`") {
      out += source[i];
      i += 1;
      continue;
    }
    let ticks = 0;
    while (i + ticks < n && source[i + ticks] === "`") ticks += 1;
    const openAt = i;
    i += ticks;
    const lineStart = source.lastIndexOf("\n", openAt - 1) + 1;
    const indent = source.slice(lineStart, openAt);
    const lineEnd = source.indexOf("\n", openAt);
    const info = lineEnd === -1 ? source.slice(i) : source.slice(i, lineEnd);
    const fence = ticks >= 3 && /^[ \t]{0,3}$/.test(indent) && /^[^`\n]*$/.test(info);
    if (fence) {
      const afterLine = lineEnd === -1 ? n : lineEnd;
      const rest = source.slice(afterLine);
      const closeRe = new RegExp("(?:^|\\n)[ \\t]{0,3}`{" + ticks + ",}[ \\t]*(?:\\n|$)");
      const found = closeRe.exec(rest);
      if (found) {
        const end = afterLine + found.index + found[0].length;
        out += source.slice(openAt, end);
        i = end;
        continue;
      }
      // Leave the fence marker readable. Splitting it stops the runaway span
      // without swallowing the paragraphs that follow an unfinished block.
      out += breakTicks(ticks);
      continue;
    }
    let j = i;
    let closed = -1;
    while (j < n) {
      if (source[j] === "\\" && j + 1 < n) {
        j += 2;
        continue;
      }
      if (source[j] !== "`") {
        j += 1;
        continue;
      }
      let run = 0;
      while (j + run < n && source[j + run] === "`") run += 1;
      if (run === ticks) {
        closed = j;
        break;
      }
      j += run;
    }
    if (closed !== -1 && closed > i) {
      out += source.slice(openAt, closed + ticks);
      i = closed + ticks;
      continue;
    }
    out += breakTicks(ticks);
  }
  return out;
}

export function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || /[\u0000-\u001f]/.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:")) {
    return null;
  }
  if (lower.startsWith("data:")) {
    return /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(trimmed) ? trimmed : null;
  }
  if (lower.startsWith("jingjian-img://")) return trimmed;
  if (lower.startsWith("jingjian-wiki://")) return trimmed;
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../") ||
    !trimmed.includes(":")
  ) {
    return trimmed;
  }
  return null;
}

export function renderMarkdown(
  source: string,
  library?: { id: string; content: string }[],
  headingSeed?: Map<string, number>,
): string {
  headingSeen.clear();
  if (headingSeed) {
    for (const [key, count] of headingSeed) headingSeen.set(key, count);
  }
  taskIndex = 0;
  const prepared = tameBackticks(library?.length ? expandNoteEmbeds(source || "", library) : source || "");
  const math = extractMath(prepared);
  const wiki = expandWikiLinks(math.source);
  const footnotes = extractFootnotes(wiki);
  const html = marked.parse(footnotes.source || "", { async: false }) as string;
  const withMath = restoreMath(html, math.slots);
  const withNotes = restoreFootnotes(withMath, footnotes.notes);
  return withNotes
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
