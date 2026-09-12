import type { Palette } from "./theme";

const UNSUPPORTED_COLOR = /oklab|oklch|(?<![a-z-])lab\(|(?<![a-z-])lch\(|color-mix\s*\(|color\s*\(/i;

export function exportArticleCss(palette: Palette): string {
  return `
html, body { margin: 0; padding: 0; background: ${palette.bg}; color: ${palette.fg}; }
article {
  box-sizing: border-box;
  width: 720px;
  padding: 48px 40px;
  background: ${palette.bg};
  color: ${palette.fg};
  font-family: "Noto Serif SC", "Songti SC", "Noto Serif CJK SC", Georgia, serif;
  font-size: 18px;
  line-height: 1.75;
  overflow-wrap: anywhere;
}
h1, h2, h3 { line-height: 1.25; font-weight: 600; }
h1 { font-size: 30px; margin: 0 0 16px; }
h2 { font-size: 22px; margin: 28px 0 12px; }
h3 { font-size: 19px; margin: 24px 0 8px; }
p, ul, ol, blockquote, pre, table { margin: 0 0 16px; }
a { color: ${palette.accent}; }
blockquote {
  border-left: 3px solid ${palette.accent};
  padding: 2px 0 2px 16px;
  color: ${palette.muted};
}
code {
  font-family: ui-monospace, monospace;
  background: ${palette.overlay};
  border-radius: 6px;
  padding: 0.1em 0.35em;
  color: ${palette.fg};
}
pre {
  background: ${palette.surface};
  color: ${palette.fg};
  border-radius: 12px;
  padding: 16px;
  overflow-x: auto;
}
pre code { background: transparent; padding: 0; }
img { max-width: 100%; }
table { border-collapse: collapse; width: 100%; }
th, td { border-bottom: 1px solid ${palette.border}; padding: 8px 10px; text-align: left; color: ${palette.fg}; }
hr { border: 0; border-top: 1px solid ${palette.border}; margin: 24px 0; }
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

async function loadHtml2Canvas() {
  try {
    const mod = await import("html2canvas-pro");
    return mod.default;
  } catch {
    const mod = await import("html2canvas");
    return mod.default;
  }
}

export async function renderArticleCanvas(
  html: string,
  palette: Palette,
): Promise<HTMLCanvasElement> {
  const css = stripUnsupportedColors(exportArticleCss(palette), palette.fg);
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;left:-12000px;top:0;width:720px;height:1200px;border:0;opacity:0;pointer-events:none;";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return drawPlainCanvas(html.replace(/<[^>]+>/g, " "), palette);
  }
  doc.open();
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body><article>${html}</article></body></html>`,
  );
  doc.close();
  if (doc.fonts?.ready) {
    await Promise.race([doc.fonts.ready, new Promise((resolve) => setTimeout(resolve, 400))]);
  }
  const article = doc.querySelector("article") ?? doc.body;
  iframe.style.height = `${Math.max(800, article.scrollHeight + 40)}px`;
  await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
  try {
    const html2canvas = await loadHtml2Canvas();
    return await html2canvas(article as HTMLElement, {
      scale: 2,
      backgroundColor: palette.bg,
      useCORS: true,
      logging: false,
      width: 720,
      windowWidth: 720,
      foreignObjectRendering: false,
      onclone(cloned) {
        flattenUnsupportedColors(cloned, palette);
      },
    });
  } catch {
    const text = (article.textContent || "").replace(/\n{3,}/g, "\n\n");
    return drawPlainCanvas(text, palette);
  } finally {
    iframe.remove();
  }
}
