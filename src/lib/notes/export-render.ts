import type { Palette } from "./theme";
import { renderMermaidBlocks } from "./mermaid-render.ts";

const UNSUPPORTED_COLOR = /oklab|oklch|(?<![a-z-])lab\(|(?<![a-z-])lch\(|color-mix\s*\(|color\s*\(/i;

export function exportArticleCss(palette: Palette): string {
  return `
html, body { margin: 0; padding: 0; background: ${palette.bg}; color: ${palette.fg}; }
article {
  box-sizing: border-box;
  width: 720px;
  padding: 44px 36px 56px;
  background: ${palette.bg};
  color: ${palette.fg};
  font-family: "Noto Serif SC", "Songti SC", "Noto Serif CJK SC", Georgia, serif;
  font-size: 17px;
  line-height: 1.75;
  overflow-wrap: break-word;
  word-break: normal;
}
h1, h2, h3, h4 { line-height: 1.3; font-weight: 600; overflow-wrap: break-word; }
h1 { font-size: 28px; margin: 0 0 16px; }
h2 { font-size: 21px; margin: 28px 0 12px; }
h3 { font-size: 18px; margin: 22px 0 8px; }
p, blockquote, table { margin: 0 0 14px; }
ul, ol { margin: 0 0 14px; padding-left: 1.6em; }
li { margin: 0 0 8px; }
li > p { margin: 0 0 8px; }
li > ul, li > ol { margin: 8px 0 0; }
a { color: ${palette.accent}; }
blockquote {
  border-left: 3px solid ${palette.accent};
  padding: 2px 0 2px 14px;
  color: ${palette.muted};
}
code {
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.88em;
  background: ${palette.overlay};
  border-radius: 5px;
  padding: 0.1em 0.35em;
  color: ${palette.fg};
  display: inline-block;
  max-width: 100%;
  white-space: nowrap;
  overflow-wrap: normal;
  word-break: keep-all;
  vertical-align: baseline;
  box-decoration-break: clone;
  -webkit-box-decoration-break: clone;
}
.code-block {
  margin: 0 0 16px;
  border-radius: 10px;
  background: ${palette.surface};
  overflow: hidden;
}
pre {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  background: ${palette.surface};
  color: ${palette.fg};
  border-radius: 10px;
  padding: 14px 16px;
  margin: 0 0 16px;
  overflow: hidden;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  tab-size: 2;
}
.code-block pre { margin: 0; background: transparent; }
pre code {
  display: inline;
  max-width: none;
  background: transparent;
  padding: 0;
  font-size: inherit;
  line-height: inherit;
  white-space: inherit;
  overflow-wrap: inherit;
  word-break: inherit;
}
pre.plain-text {
  background: transparent;
  padding: 0;
  margin: 0 0 14px;
  font-family: inherit;
  font-size: inherit;
  line-height: inherit;
  white-space: pre-wrap;
  overflow-wrap: break-word;
  word-break: normal;
}
.hljs { background: transparent; padding: 0; }
img { max-width: 100%; height: auto; display: block; }
.mermaid-block {
  margin: 0 0 16px;
  padding: 12px 10px;
  background: ${palette.paper};
  border-radius: 10px;
  overflow: hidden;
}
.mermaid-svg, .mermaid-block svg, .mermaid-block img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0 auto;
}
pre.mermaid {
  background: ${palette.paper};
  color: ${palette.fg};
}
pre.mermaid-failed {
  color: ${palette.muted};
  font-size: 12.5px;
}
table { border-collapse: collapse; width: 100%; table-layout: fixed; }
th, td {
  border-bottom: 1px solid ${palette.border};
  padding: 8px 10px;
  text-align: left;
  color: ${palette.fg};
  overflow-wrap: break-word;
  word-break: normal;
}
hr { border: 0; border-top: 1px solid ${palette.border}; margin: 22px 0; }
`.trim();
}

export function cssUsesUnsupportedColor(css: string): boolean {
  return UNSUPPORTED_COLOR.test(css);
}

const COLOR_FNS = ["color-mix", "oklab", "oklch", "lab", "lch", "color"];

export function stripUnsupportedColors(input: string, fallback = "#000000"): string {
  let output = "";
  let index = 0;
  while (index < input.length) {
    let matched = false;
    const lower = input.slice(index).toLowerCase();
    for (const name of COLOR_FNS) {
      if (!lower.startsWith(name) || input[index + name.length] !== "(") continue;
      const prev = input[index - 1];
      if (prev && /[a-z-]/i.test(prev)) continue;
      let depth = 0;
      let cursor = index + name.length;
      for (; cursor < input.length; cursor += 1) {
        if (input[cursor] === "(") depth += 1;
        else if (input[cursor] === ")") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
        }
      }
      output += fallback;
      index = cursor;
      matched = true;
      break;
    }
    if (!matched) {
      output += input[index];
      index += 1;
    }
  }
  return output;
}

function canvasSafeColor(value: string, fallback: string): string {
  if (!value) return fallback;
  if (!UNSUPPORTED_COLOR.test(value)) return value;
  try {
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return fallback;
    ctx.fillStyle = fallback;
    ctx.fillStyle = value;
    const next = String(ctx.fillStyle);
    if (!next || UNSUPPORTED_COLOR.test(next)) return fallback;
    return next;
  } catch {
    return fallback;
  }
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const char of paragraph) {
      const next = current + char;
      if (current && ctx.measureText(next).width > maxWidth) {
        lines.push(current);
        current = char;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

export function drawPlainCanvas(text: string, palette: Palette): HTMLCanvasElement {
  const width = 1400;
  const padding = 72;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.width = width;
    canvas.height = 800;
    return canvas;
  }
  ctx.font = '32px "Noto Serif SC", serif';
  const lines = wrapLines(ctx, text.replace(/\t/g, "  "), width - padding * 2);
  const lineHeight = 48;
  canvas.width = width;
  canvas.height = Math.max(900, padding * 2 + lines.length * lineHeight);
  ctx.fillStyle = palette.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = palette.fg;
  ctx.font = '32px "Noto Serif SC", serif';
  ctx.textBaseline = "top";
  lines.forEach((line, index) => {
    ctx.fillText(line, padding, padding + index * lineHeight);
  });
  return canvas;
}

function flattenUnsupportedColors(root: ParentNode, palette: Palette) {
  const nodes = [root, ...root.querySelectorAll("*")];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) continue;
    const style = node.style;
    for (let index = style.length - 1; index >= 0; index -= 1) {
      const name = style.item(index);
      const value = style.getPropertyValue(name);
      if (!UNSUPPORTED_COLOR.test(value)) continue;
      const fallback = /background|fill/i.test(name) ? palette.bg : palette.fg;
      style.setProperty(name, canvasSafeColor(value, fallback), style.getPropertyPriority(name));
    }
    const attr = node.getAttribute("style");
    if (attr && UNSUPPORTED_COLOR.test(attr)) {
      node.setAttribute("style", stripUnsupportedColors(attr, palette.fg));
    }
    for (const name of ["fill", "stroke", "color", "stop-color", "flood-color"]) {
      const value = node.getAttribute(name);
      if (value && UNSUPPORTED_COLOR.test(value)) {
        node.setAttribute(name, canvasSafeColor(value, palette.fg));
      }
    }
  }
  if ("querySelectorAll" in root) {
    root.querySelectorAll("style").forEach((styleEl) => {
      const text = styleEl.textContent || "";
      if (!UNSUPPORTED_COLOR.test(text)) return;
      styleEl.textContent = stripUnsupportedColors(text, palette.fg);
    });
  }
}

export function fitInlineCode(root: ParentNode): void {
  const article =
    ("querySelector" in root ? root.querySelector("article") : null) ??
    (root instanceof HTMLElement ? root : null);
  if (!article) return;
  const width = article instanceof HTMLElement && article.clientWidth > 0
    ? article.clientWidth
    : 720;
  article.querySelectorAll("code").forEach((node) => {
    if (!(node instanceof HTMLElement) || node.closest("pre")) return;
    node.style.display = "inline-block";
    node.style.maxWidth = "100%";
    node.style.whiteSpace = "nowrap";
    node.style.overflowWrap = "normal";
    node.style.wordBreak = "keep-all";
    node.style.verticalAlign = "baseline";
    if (node.scrollWidth > width - 8) {
      node.style.whiteSpace = "pre-wrap";
      node.style.overflowWrap = "anywhere";
      node.style.wordBreak = "break-word";
    }
  });
}

async function loadHtml2Canvas() {
  try {
    const mod = await import("html2canvas-pro");
    return mod.default;
  } catch {
    const mod = await import("html2canvas");
    return mod.default;
  }
}

export type KeepRange = { start: number; end: number };

export type ArticleCapture = {
  canvas: HTMLCanvasElement;
  breaks: number[];
  keeps: KeepRange[];
};

function collectLayout(article: HTMLElement, scale: number): {
  breaks: number[];
  keeps: KeepRange[];
} {
  const root = article.getBoundingClientRect();
  const toY = (value: number) => Math.max(0, Math.round(value * scale));
  const breaks: number[] = [];
  const keeps: KeepRange[] = [];
  const blocks = article.querySelectorAll(
    "h1,h2,h3,h4,p,ul,ol,li,pre,blockquote,table,hr,img,.code-block,.mermaid-block",
  );
  for (const node of blocks) {
    const rect = (node as HTMLElement).getBoundingClientRect();
    const start = toY(rect.top - root.top - 2);
    const end = toY(rect.bottom - root.top + 2);
    if (end <= start) continue;
    breaks.push(start, end);
    const tag = node.tagName;
    const keep =
      tag === "PRE" ||
      tag === "TABLE" ||
      tag === "H1" ||
      tag === "H2" ||
      tag === "H3" ||
      tag === "BLOCKQUOTE" ||
      tag === "P" ||
      tag === "LI" ||
      (node as HTMLElement).classList.contains("code-block") ||
      (node as HTMLElement).classList.contains("mermaid-block");
    if (keep) keeps.push({ start, end });
  }
  return {
    breaks: [...new Set(breaks)].sort((a, b) => a - b),
    keeps: keeps.sort((a, b) => a.start - b.start),
  };
}

export async function renderArticleCanvas(
  html: string,
  palette: Palette,
): Promise<ArticleCapture> {
  const css = stripUnsupportedColors(exportArticleCss(palette), palette.fg);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:720px;height:1200px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const fallback = () => {
    const canvas = drawPlainCanvas(html.replace(/<[^>]+>/g, " "), palette);
    return { canvas, breaks: [], keeps: [] };
  };
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return fallback();
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><article>${html}</article></body></html>`,
  );
  doc.close();
  if (doc.fonts?.ready) {
    await Promise.race([doc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 400))]);
  }
  const article = (doc.querySelector("article") ?? doc.body) as HTMLElement;
  await renderMermaidBlocks(article, { palette, rasterize: true });
  iframe.style.height = `${Math.max(800, article.scrollHeight + 48)}px`;
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  fitInlineCode(article);
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  const scale = 2;
  const layout = collectLayout(article, scale);
  try {
    const html2canvas = await loadHtml2Canvas();
    const canvas = await html2canvas(article, {
      scale,
      backgroundColor: palette.bg,
      useCORS: true,
      logging: false,
      width: 720,
      windowWidth: 720,
      foreignObjectRendering: false,
      onclone(cloned) {
        flattenUnsupportedColors(cloned, palette);
        cloned.querySelectorAll("pre").forEach((pre) => {
          if (pre.classList.contains("mermaid") || pre.classList.contains("mermaid-failed")) return;
          pre.style.whiteSpace = "pre-wrap";
          pre.style.overflow = "hidden";
          pre.style.overflowWrap = "anywhere";
          pre.style.wordBreak = "break-word";
        });
        fitInlineCode(cloned);
      },
    });
    return { canvas, breaks: layout.breaks, keeps: layout.keeps };
  } catch {
    const text = (article.textContent || "").replace(/\n{3,}/g, "\n\n");
    return { canvas: drawPlainCanvas(text, palette), breaks: [], keeps: [] };
  } finally {
    iframe.remove();
  }
}
