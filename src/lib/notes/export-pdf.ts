import { concatBytes, latin1 } from "./bytes.ts";

export type PdfPage = {
  jpeg: Uint8Array;
  width: number;
  height: number;
};

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
  quality = 0.82,
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

export function sliceCanvasToPages(source: HTMLCanvasElement): HTMLCanvasElement[] {
  const pageHeight = Math.max(1, Math.round((source.width * (PAGE_H - MARGIN * 2)) / (PAGE_W - MARGIN * 2)));
  const pages: HTMLCanvasElement[] = [];
  let top = 0;
  while (top < source.height) {
    const slice = Math.min(pageHeight, source.height - top);
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = slice;
    const ctx = canvas.getContext("2d");
    if (!ctx) break;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(source, 0, top, source.width, slice, 0, 0, source.width, slice);
    pages.push(canvas);
    top += slice;
  }
  return pages.length > 0 ? pages : [source];
}
