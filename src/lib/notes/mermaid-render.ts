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

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const attr = (name: string) => {
    const raw = svg.getAttribute(name);
    if (!raw || raw.endsWith("%")) return 0;
    const value = Number.parseFloat(raw);
    return Number.isFinite(value) ? value : 0;
  };
  let width = attr("width") || svg.clientWidth || 0;
  let height = attr("height") || svg.clientHeight || 0;
  const viewBox = svg.viewBox?.baseVal;
  if ((!width || !height) && viewBox && viewBox.width && viewBox.height) {
    width = width || viewBox.width;
    height = height || viewBox.height;
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
      if (!options.rasterize) continue;
      const svgEl = wrap.querySelector("svg");
      if (!(svgEl instanceof SVGSVGElement)) continue;
      await new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));
      const png = await svgToPngDataUrl(svgEl, background);
      if (!png || !wrap.isConnected) continue;
      const image = doc.createElement("img");
      image.src = png;
      image.alt = "流程图";
      image.className = "mermaid-image";
      wrap.replaceChildren(image);
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
