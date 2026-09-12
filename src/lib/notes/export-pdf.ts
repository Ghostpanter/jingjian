import { concatBytes, latin1 } from "./bytes.ts";

export type PdfPage = {
  jpeg: Uint8Array;
  width: number;
  height: number;
};

export type KeepRange = { start: number; end: number };

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 36;

export function jpegPagesToPdf(pages: PdfPage[]): Uint8Array {
  if (pages.length === 0) throw new Error("没有可导出的页面");
  const objects: Uint8Array[] = [];
  const offsets: number[] = [0];

  function addObject(body: Uint8Array): number {
    const index = objects.length + 1;
    objects.push(body);
    return index;
  }

  const kids: number[] = [];
  const imageIds: number[] = [];
  const contentIds: number[] = [];

  for (const page of pages) {
    const fit = Math.min(
      (PAGE_W - MARGIN * 2) / page.width,
      (PAGE_H - MARGIN * 2) / page.height,
    );
    const drawW = page.width * fit;
    const drawH = page.height * fit;
    const x = (PAGE_W - drawW) / 2;
    const y = PAGE_H - MARGIN - drawH;
    const imageId = addObject(
      concatBytes([
        latin1(
          `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`,
        ),
        page.jpeg,
        latin1("\nendstream\n"),
      ]),
    );
    imageIds.push(imageId);
    const stream = latin1(`q ${drawW.toFixed(2)} 0 0 ${drawH.toFixed(2)} ${x.toFixed(2)} ${y.toFixed(2)} cm /Im0 Do Q\n`);
    contentIds.push(
      addObject(
        concatBytes([
          latin1(`<< /Length ${stream.length} >>\nstream\n`),
          stream,
          latin1("endstream\n"),
        ]),
      ),
    );
  }

  const pagesId = objects.length + pages.length + 1;
  for (let index = 0; index < pages.length; index += 1) {
    const pageId = addObject(
      latin1(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /XObject << /Im0 ${imageIds[index]} 0 R >> >> /Contents ${contentIds[index]} 0 R >>\n`,
      ),
    );
    kids.push(pageId);
  }

  const actualPagesId = addObject(
    latin1(
      `<< /Type /Pages /Kids [${kids.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\n`,
    ),
  );
  const catalogId = addObject(latin1(`<< /Type /Catalog /Pages ${actualPagesId} 0 R >>\n`));

  const header = latin1("%PDF-1.4\n%\x80\x80\x80\x80\n");
  let cursor = header.length;
  const bodyParts = [header];
  for (let index = 0; index < objects.length; index += 1) {
    const objectId = index + 1;
    const prefix = latin1(`${objectId} 0 obj\n`);
    const suffix = latin1("endobj\n");
    offsets[objectId] = cursor;
    bodyParts.push(prefix, objects[index], suffix);
    cursor += prefix.length + objects[index].length + suffix.length;
  }

  const xrefStart = cursor;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let index = 1; index <= objects.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  bodyParts.push(latin1(xref), latin1(trailer));
  return concatBytes(bodyParts);
}

export async function canvasToJpeg(
  canvas: HTMLCanvasElement,
  quality = 0.86,
): Promise<Uint8Array> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error("无法生成图片"))),
      "image/jpeg",
      quality,
    );
  });
  return new Uint8Array(await blob.arrayBuffer());
}

export function pageContentHeight(canvasWidth: number): number {
  return Math.max(1, Math.round((canvasWidth * (PAGE_H - MARGIN * 2)) / (PAGE_W - MARGIN * 2)));
}

export function choosePageCut(input: {
  top: number;
  pageHeight: number;
  contentHeight: number;
  breaks: number[];
  keeps: KeepRange[];
}): number {
  const { top, pageHeight, contentHeight, breaks, keeps } = input;
  const ideal = Math.min(top + pageHeight, contentHeight);
  if (ideal >= contentHeight - 2) return contentHeight;
  const minY = top + Math.floor(pageHeight * 0.68);
  const sortedKeeps = [...keeps].sort((a, b) => a.start - b.start);
  for (const keep of sortedKeeps) {
    if (keep.end - keep.start > pageHeight) continue;
    if (keep.start < minY || keep.start >= ideal) continue;
    if (keep.end > ideal) return Math.max(top + 1, Math.round(keep.start));
  }
  let best = 0;
  for (const y of breaks) {
    if (y > minY && y <= ideal && y > best) best = y;
  }
  if (best >= minY) return Math.round(best);
  return ideal;
}

function parseHex(color: string): [number, number, number] {
  const raw = color.trim().replace("#", "");
  const hex =
    raw.length === 3
      ? raw
          .split("")
          .map((part) => part + part)
          .join("")
      : raw.padEnd(6, "0").slice(0, 6);
  const value = Number.parseInt(hex, 16);
  if (Number.isNaN(value)) return [255, 255, 255];
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function findQuietCut(
  canvas: HTMLCanvasElement,
  minY: number,
  ideal: number,
  background: string,
): number | null {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const height = ideal - minY;
  if (height < 12) return null;
  const width = canvas.width;
  let image: ImageData;
  try {
    image = ctx.getImageData(0, minY, width, height);
  } catch {
    return null;
  }
  const [br, bg, bb] = parseHex(background);
  const ink = new Float32Array(height);
  for (let y = 0; y < height; y += 1) {
    let count = 0;
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const i = row + x * 4;
      const dr = image.data[i] - br;
      const dg = image.data[i + 1] - bg;
      const db = image.data[i + 2] - bb;
      if (dr * dr + dg * dg + db * db > 900) count += 1;
    }
    ink[y] = count / width;
  }
  const threshold = 0.02;
  let y = height - 1;
  while (y >= 0) {
    if (ink[y] > threshold) {
      y -= 1;
      continue;
    }
    let start = y;
    while (start >= 0 && ink[start] <= threshold) start -= 1;
    start += 1;
    if (y - start + 1 >= 8) return minY + y;
    y = start - 1;
  }
  return null;
}

function copySlice(
  source: HTMLCanvasElement,
  top: number,
  sliceHeight: number,
  background: string,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = Math.max(1, sliceHeight);
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(
    source,
    0,
    top,
    source.width,
    sliceHeight,
    0,
    0,
    source.width,
    sliceHeight,
  );
  return canvas;
}

export function sliceCanvasToPages(
  source: HTMLCanvasElement,
  options?: {
    background?: string;
    breaks?: number[];
    keeps?: KeepRange[];
  },
): HTMLCanvasElement[] {
  const pageHeight = pageContentHeight(source.width);
  const background = options?.background ?? "#ffffff";
  const breaks = options?.breaks ?? [];
  const keeps = options?.keeps ?? [];
  const pages: HTMLCanvasElement[] = [];
  let top = 0;
  while (top < source.height) {
    const remaining = source.height - top;
    if (remaining <= pageHeight + 4) {
      pages.push(copySlice(source, top, remaining, background));
      break;
    }
    const minY = top + Math.floor(pageHeight * 0.68);
    const ideal = top + pageHeight;
    let cut = choosePageCut({
      top,
      pageHeight,
      contentHeight: source.height,
      breaks,
      keeps,
    });
    if (cut >= ideal - 1) {
      const quiet = findQuietCut(source, minY, ideal, background);
      if (quiet != null) cut = quiet;
    }
    cut = Math.max(top + 32, Math.min(cut, source.height));
    pages.push(copySlice(source, top, cut - top, background));
    top = cut;
  }
  return pages.length > 0 ? pages : [source];
}
