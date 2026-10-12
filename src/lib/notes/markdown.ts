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
  tameOpenFences,
} from "./markdown-extra.ts";
import { headingIdFor, slugifyHeading } from "./outline.ts";

const marked = new Marked({
  gfm: true,
  breaks: true,
});

const headingSeen = new Map<string, number>();
let taskIndex = 0;
/** Base heading slugs used by the current render, for incremental preview caching. */
let headingTrace: string[] = [];

marked.use({
  renderer: {
    heading({ text, depth }) {
      const plain = String(text).replace(/<[^>]+>/g, "");
      headingTrace.push(slugifyHeading(plain));
      const id = headingIdFor(plain, headingSeen);
      return `<h${depth} id="${escapeHtml(id)}">${text}</h${depth}>\n`;
    },
    html({ text }) {
      return sanitizeInlineHtml(text);
    },
    code({ text, lang }) {
      if (isMermaidBlock(lang, text)) {
        const source = escapeHtml(text).replaceAll("\r", "&#13;").replaceAll("\n", "&#10;");
        return `<div class="mermaid-block"><pre class="mermaid" data-source="${source}">${escapeHtml(text)}</pre></div>`;
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
        const raw = safe.slice("jingjian-wiki://".length);
        let wiki = raw;
        try {
          wiki = decodeURIComponent(raw);
        } catch {
          // Hand-written % sequences must not crash the whole preview.
        }
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

function hasControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    if (value.charCodeAt(i) < 0x20) return true;
  }
  return false;
}

export function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || hasControlChar(trimmed)) return null;
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

export type RenderState = {
  html: string;
  /** Heading-id counts after this render (feed into the next section). */
  seen: Map<string, number>;
  /** Base slugs of the headings this render produced, in order. */
  headings: string[];
  /** Task checkboxes this render drew. */
  tasks: number;
};

/**
 * renderMarkdown plus the bookkeeping the incremental preview needs: where task
 * numbering starts, and the heading-id state before and after.
 */
export function renderMarkdownState(
  source: string,
  options: {
    library?: { id: string; content: string }[];
    headingSeed?: Map<string, number>;
    taskStart?: number;
  } = {},
): RenderState {
  const html = renderMarkdown(source, options.library, options.headingSeed, options.taskStart ?? 0);
  return {
    html,
    seen: new Map(headingSeen),
    headings: [...headingTrace],
    tasks: taskIndex - (options.taskStart ?? 0),
  };
}

const UNSAFE_URL_ATTR = /^(?:href|src|xlink:href|action|formaction|srcdoc)$/i;
const ATTRIBUTE = /\s+([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;

function decodeAttr(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);?/g, (_, dec: string) => String.fromCharCode(Number(dec)))
    .replace(/&colon;/gi, ":")
    .replace(/&tab;|&newline;/gi, "");
}

function isScriptUrl(raw: string): boolean {
  const decoded = decodeAttr(raw.replace(/^["']|["']$/g, ""));
  let value = "";
  for (const char of decoded) if (char.charCodeAt(0) > 0x20) value += char;
  value = value.toLowerCase();
  return value.startsWith("javascript:") || value.startsWith("vbscript:");
}

/** Drop event-handler and script-URL attributes from one start tag. */
function sanitizeStartTag(tag: string): string {
  const head = /^<[a-zA-Z][^\s/>]*/.exec(tag);
  if (!head) return tag;
  let out = head[0];
  let i = head[0].length;
  ATTRIBUTE.lastIndex = i;
  let match: RegExpExecArray | null;
  while ((match = ATTRIBUTE.exec(tag))) {
    const name = match[1] ?? "";
    const value = match[2];
    i = ATTRIBUTE.lastIndex;
    if (/^on/i.test(name)) continue;
    if (value !== undefined && UNSAFE_URL_ATTR.test(name) && isScriptUrl(value)) continue;
    out += match[0];
  }
  return out + tag.slice(i);
}

/**
 * Sanitize rendered HTML at the tag level. Text — including Mermaid source and
 * code — is left alone, so writing `onclick=` or `javascript:` in a note no
 * longer deletes those words from the preview.
 */
export function sanitizeRenderedHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<[a-zA-Z][^\s/>]*(?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>/g, sanitizeStartTag);
}

export function renderMarkdown(
  source: string,
  library?: { id: string; content: string }[],
  headingSeed?: Map<string, number>,
  taskStart = 0,
): string {
  headingSeen.clear();
  headingTrace = [];
  if (headingSeed) {
    for (const [key, count] of headingSeed) headingSeen.set(key, count);
  }
  taskIndex = taskStart;
  const prepared = tameOpenFences(library?.length ? expandNoteEmbeds(source || "", library) : source || "");
  const math = extractMath(prepared);
  const wiki = expandWikiLinks(math.source);
  const footnotes = extractFootnotes(wiki);
  const html = marked.parse(footnotes.source || "", { async: false }) as string;
  const withMath = restoreMath(html, math.slots);
  const withNotes = restoreFootnotes(withMath, footnotes.notes);
  return sanitizeRenderedHtml(withNotes);
}
