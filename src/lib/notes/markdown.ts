import { Marked } from "marked";
import { escapeHtml } from "./escape-html.ts";
import { displayLang, highlightCode } from "./highlight.ts";
import {
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
        return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
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

export function renderMarkdown(source: string): string {
  headingSeen.clear();
  taskIndex = 0;
  const math = extractMath(source || "");
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
