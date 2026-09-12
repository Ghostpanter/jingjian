import { cssVarsFromPalette, paletteFor, readThemeConfig } from "./theme";
import { firstLineTitle } from "./markdown-file";
import { renderMarkdown } from "./markdown";
import { getImage } from "./image-store";
import {
  markdownToDocx,
  markdownToHtmlDocument,
  markdownToOdt,
  markdownToRtf,
} from "./export-formats";
import { canvasToJpeg, jpegPagesToPdf, sliceCanvasToPages } from "./export-pdf";
import { renderArticleCanvas } from "./export-render";
import { saveExportedFile } from "./export-save";
import { buildEpub, chaptersFromNotes } from "./epub";
import { safeFilename } from "./bytes";
import type { Note } from "./types";

export type ExportFormat =
  | "pdf"
  | "html"
  | "html-plain"
  | "image"
  | "docx"
  | "odt"
  | "rtf"
  | "epub";

export const EXPORT_OPTIONS: { id: ExportFormat; label: string }[] = [
  { id: "pdf", label: "PDF" },
  { id: "html", label: "HTML" },
  { id: "html-plain", label: "HTML (without Styles)" },
  { id: "image", label: "Image" },
  { id: "docx", label: "Word (.docx)" },
  { id: "odt", label: "OpenOffice" },
  { id: "rtf", label: "RTF" },
  { id: "epub", label: "Epub" },
];

const MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  html: "text/html;charset=utf-8",
  "html-plain": "text/html;charset=utf-8",
  image: "image/png",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
  rtf: "application/rtf",
  epub: "application/epub+zip",
};

const EXT: Record<ExportFormat, string> = {
  pdf: "pdf",
  html: "html",
  "html-plain": "html",
  image: "png",
  docx: "docx",
  odt: "odt",
  rtf: "rtf",
  epub: "epub",
};

async function embedLocalImages(markdown: string): Promise<string> {
  const matches = [...markdown.matchAll(/!\[[^\]]*]\(([^)]+)\)/g)];
  let next = markdown;
  for (const match of matches) {
    const src = match[1];
    const stored = await getImage(src);
    if (!stored) continue;
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(stored.blob);
    });
    next = next.replaceAll(src, data);
  }
  return next;
}

export async function exportNotes(options: {
  format: ExportFormat;
  note: Note;
  notes: Note[];
}): Promise<string> {
  const title = firstLineTitle(options.note.content);
  const filename = `${safeFilename(title)}.${EXT[options.format]}`;
  const theme = readThemeConfig();
  const palette = paletteFor(theme);
  const markdown = await embedLocalImages(options.note.content);

  if (options.format === "html" || options.format === "html-plain") {
    const bytes = markdownToHtmlDocument(markdown, {
      title,
      styled: options.format === "html",
      cssVars: cssVarsFromPalette(palette),
    });
    return saveExportedFile(filename, bytes, MIME[options.format]);
  }

  if (options.format === "rtf") {
    return saveExportedFile(filename, markdownToRtf(markdown), MIME.rtf);
  }
  if (options.format === "docx") {
    return saveExportedFile(filename, await markdownToDocx(markdown), MIME.docx);
  }
  if (options.format === "odt") {
    return saveExportedFile(filename, await markdownToOdt(markdown), MIME.odt);
  }
  if (options.format === "epub") {
    const siblings = options.note.bookId
      ? options.notes.filter((item) => item.bookId === options.note.bookId)
      : [options.note];
    const book = chaptersFromNotes(siblings, title);
    const bytes = await buildEpub({
      title: book.title,
      chapters: await Promise.all(
        book.chapters.map(async (chapter) => ({
          ...chapter,
          content: await embedLocalImages(chapter.content),
        })),
      ),
    });
    const bookName = `${safeFilename(book.title)}.epub`;
    return saveExportedFile(bookName, bytes, MIME.epub);
  }

  const html = renderMarkdown(markdown);
  const canvas = await renderArticleCanvas(html, palette);
  if (options.format === "image") {
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("无法导出图片"))),
        "image/png",
      );
    });
    return saveExportedFile(filename, new Uint8Array(await blob.arrayBuffer()), MIME.image);
  }

  const pages = [];
  for (const slice of sliceCanvasToPages(canvas)) {
    pages.push({
      jpeg: await canvasToJpeg(slice),
      width: slice.width,
      height: slice.height,
    });
  }
  return saveExportedFile(filename, jpegPagesToPdf(pages), MIME.pdf);
}
