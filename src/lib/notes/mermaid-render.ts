import type { Palette } from "./theme";

let mermaidMod: typeof import("mermaid")["default"] | null = null;
let renderSerial = 0;

function themeVariables(palette?: Palette) {
  const bg = palette?.paper ?? "#f7f3eb";
  const surface = palette?.surface ?? "#e8e0d2";
  const fg = palette?.fg ?? "#1a1814";
  const accent = palette?.accent ?? "#2c4a42";
  const overlay = palette?.overlay ?? "#ddd4c4";
  return {
    background: bg,
    primaryColor: surface,
    primaryTextColor: fg,
    primaryBorderColor: accent,
    secondaryColor: bg,
    tertiaryColor: overlay,
    lineColor: accent,
    textColor: fg,
    mainBkg: bg,
    nodeBorder: accent,
    clusterBkg: surface,
    clusterBorder: accent,
    titleColor: fg,
    edgeLabelBackground: bg,
    actorBkg: bg,
    actorBorder: accent,
    actorTextColor: fg,
    signalColor: accent,
    labelBoxBkgColor: bg,
    labelTextColor: fg,
    noteBkgColor: overlay,
    noteTextColor: fg,
    noteBorderColor: accent,
  };
}

async function mermaidApi(palette?: Palette) {
  mermaidMod ??= (await import("mermaid")).default;
  mermaidMod.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: '"Noto Sans SC", "Noto Sans CJK SC", sans-serif',
    themeVariables: themeVariables(palette),
    flowchart: {
      htmlLabels: false,
      curve: "basis",
      useMaxWidth: true,
      padding: 12,
    },
    sequence: { useMaxWidth: true },
    gantt: { useMaxWidth: true },
  });
  return mermaidMod;
}

function isSvgElement(node: Element | null): node is SVGSVGElement {
  if (!node) return false;
  const Ctor = node.ownerDocument?.defaultView?.SVGSVGElement ?? SVGSVGElement;
  try {
    if (node instanceof Ctor) return true;
  } catch {
    // Cross-realm instanceof can throw in some hosts.
  }
  return node.namespaceURI === "http://www.w3.org/2000/svg" && node.tagName.toLowerCase() === "svg";
}

function parsePx(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const viewBox = svg.viewBox?.baseVal;
  const vbW = viewBox && viewBox.width > 0 ? viewBox.width : 0;
  const vbH = viewBox && viewBox.height > 0 ? viewBox.height : 0;
  const attr = (name: string) => {
    const raw = svg.getAttribute(name);
    if (!raw || raw.endsWith("%")) return 0;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) && value > 0 ? value : 0;
  };
  const attrW = attr("width");
  const attrH = attr("height");
  if (attrW && attrH) return { width: attrW, height: attrH };

  const styleMax = parsePx(svg.style.maxWidth);
  const styleW = parsePx(svg.style.width);
  const styleH = parsePx(svg.style.height);
  let width = styleMax || attrW || styleW || vbW || svg.clientWidth || 0;
  let height = attrH || styleH || svg.clientHeight || 0;
  if (vbW && vbH) {
    if (!width && !height) {
      width = vbW;
      height = vbH;
    } else if (width) {
      height = width * (vbH / vbW);
    } else {
      width = height * (vbW / vbH);
    }
  }
  if (!width || !height) {
    try {
      const box = svg.getBBox();
      width = width || box.width;
      height = height || box.height;
    } catch {
      // SVG not laid out yet.
    }
  }
  return {
    width: Math.max(1, width || 640),
    height: Math.max(1, height || 240),
  };
}

function figureBox(el: Element): { width: number; height: number } {
  if (el.tagName.toLowerCase() === "img") {
    const img = el as HTMLImageElement;
    return {
      width: img.naturalWidth || img.clientWidth || 0,
      height: img.naturalHeight || img.clientHeight || 0,
    };
  }
  if (isSvgElement(el)) return svgSize(el);
  return { width: el.clientWidth, height: el.clientHeight };
}

export function fitMermaidFigure(
  wrap: HTMLElement,
  maxWidth: number,
  maxHeight = Number.POSITIVE_INFINITY,
): void {
  const el = wrap.querySelector("img, svg");
  if (!el) return;
  const box = figureBox(el);
  if (!box.width || !box.height) return;
  const widthLimit = Math.max(1, maxWidth);
  const heightLimit = Math.max(1, maxHeight);
  const scale = Math.min(widthLimit / box.width, heightLimit / box.height, 1);
  const width = Math.max(1, Math.round(box.width * scale));
  const height = Math.max(1, Math.round(box.height * scale));
  const node = el as HTMLElement;
  node.style.width = `${width}px`;
  node.style.height = `${height}px`;
  node.style.maxWidth = `${width}px`;
  node.style.maxHeight = `${height}px`;
  node.style.objectFit = "contain";
  if (el.tagName.toLowerCase() === "svg") {
    node.setAttribute("width", String(width));
    node.setAttribute("height", String(height));
  }
}

async function svgToPngDataUrl(svg: SVGSVGElement, background: string): Promise<string | null> {
  const { width, height } = svgSize(svg);
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  if (!clone.getAttribute("viewBox")) {
    clone.setAttribute("viewBox", `0 0 ${width} ${height}`);
  }
  const xml = new XMLSerializer().serializeToString(clone);
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  const image = new Image();
  image.decoding = "sync";
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("svg"));
      image.src = url;
    });
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

export type MermaidRenderOptions = {
  palette?: Palette;
  rasterize?: boolean;
  maxHeight?: number;
};

export async function renderMermaidBlocks(
  root: HTMLElement,
  options: MermaidRenderOptions = {},
): Promise<void> {
  const pending = [...root.querySelectorAll<HTMLElement>("pre.mermaid")].filter(
    (node) => node.getAttribute("data-processed") !== "true",
  );
  if (pending.length === 0) return;
  const batch = ++renderSerial;
  const mermaid = await mermaidApi(options.palette);
  if (batch !== renderSerial) return;

  const nodes = [...root.querySelectorAll<HTMLElement>("pre.mermaid")].filter(
    (node) => node.isConnected && node.getAttribute("data-processed") !== "true",
  );
  const doc = root.ownerDocument ?? document;
  const background = options.palette?.paper ?? "#f7f3eb";

  for (const [index, node] of nodes.entries()) {
    if (batch !== renderSerial) return;
    if (!node.isConnected) continue;
    const source = node.textContent ?? "";
    const id = `jingjian-mmd-${Date.now().toString(36)}-${index}`;
    try {
      const { svg } = await mermaid.render(id, source);
      if (batch !== renderSerial || !node.isConnected) continue;
      const wrap = doc.createElement("div");
      wrap.className = "mermaid-svg";
      wrap.setAttribute("data-processed", "true");
      wrap.innerHTML = svg;
      node.replaceWith(wrap);
      const svgEl = [...wrap.querySelectorAll("svg")].find(isSvgElement) ?? null;
      if (svgEl) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
        const laidOut = svgSize(svgEl);
        svgEl.setAttribute("width", String(laidOut.width));
        svgEl.setAttribute("height", String(laidOut.height));
        svgEl.style.width = `${laidOut.width}px`;
        svgEl.style.height = `${laidOut.height}px`;
        const maxWidth = Math.max(1, wrap.clientWidth || wrap.parentElement?.clientWidth || 640);
        const maxHeight = options.maxHeight ?? Number.POSITIVE_INFINITY;
        if (options.rasterize || Number.isFinite(maxHeight)) {
          fitMermaidFigure(wrap, maxWidth, maxHeight);
        }
      }
      if (options.rasterize && svgEl && wrap.isConnected) {
        const fitted = [...wrap.querySelectorAll("svg")].find(isSvgElement);
        if (fitted) {
          const png = await svgToPngDataUrl(fitted, background);
          if (png && wrap.isConnected) {
            const size = svgSize(fitted);
            const image = doc.createElement("img");
            image.alt = "流程图";
            image.className = "mermaid-image";
            image.style.width = `${size.width}px`;
            image.style.height = `${size.height}px`;
            image.style.maxWidth = `${size.width}px`;
            image.style.maxHeight = `${size.height}px`;
            image.style.objectFit = "contain";
            wrap.style.width = `${size.width}px`;
            wrap.style.margin = "0 auto";
            await new Promise<void>((resolve) => {
              image.onload = () => resolve();
              image.onerror = () => resolve();
              image.src = png;
            });
            wrap.replaceChildren(image);
          }
        }
      }
    } catch {
      if (!node.isConnected) continue;
      node.setAttribute("data-processed", "true");
      node.classList.add("mermaid-failed");
    }
  }
}

export async function hydrateMermaidMarkup(
  html: string,
  options: MermaidRenderOptions = {},
): Promise<string> {
  if (typeof document === "undefined" || !/class="mermaid"/.test(html)) return html;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText =
    "position:fixed;left:-12000px;top:0;width:720px;visibility:hidden;pointer-events:none;";
  host.innerHTML = html;
  document.body.appendChild(host);
  try {
    await renderMermaidBlocks(host, options);
    return host.innerHTML;
  } finally {
    host.remove();
  }
}
