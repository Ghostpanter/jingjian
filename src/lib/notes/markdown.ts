import { Marked } from "marked";
import { escapeHtml } from "./escape-html.ts";
import { displayLang, highlightCode } from "./highlight.ts";

const marked = new Marked({
  gfm: true,
  breaks: true,
});

marked.use({
  renderer: {
    html() {
      return "";
    },
    code({ text, lang }) {
      if (isMermaidBlock(lang, text)) {
        return `<div class="mermaid-block"><pre class="mermaid">${escapeHtml(text)}</pre></div>`;
      }
      const label = displayLang(lang);
      const highlighted = highlightCode(text, lang);
      const langAttr = label ? ` data-lang="${escapeHtml(label)}"` : "";
      const className = label ? ` class="hljs language-${escapeHtml(label)}"` : ' class="hljs"';
      return `<div class="code-block"${langAttr}><pre><code${className}>${highlighted}</code></pre></div>`;
    },
    link({ href, title, text }) {
      const safe = sanitizeHref(href);
      if (!safe) return escapeHtml(text);
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

export function sanitizeHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || /[\u0000-\u001f]/.test(trimmed)) return null;
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("data:")) {
    return null;
  }
  if (
    trimmed.startsWith("https://") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }
  return null;
}

export function renderMarkdown(source: string): string {
  const html = marked.parse(source || "", { async: false }) as string;
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/javascript:/gi, "");
}
