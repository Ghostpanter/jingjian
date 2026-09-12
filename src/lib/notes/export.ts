import { cssVarsFromPalette, paletteFor, readThemeConfig } from "./theme";
import { firstLineTitle } from "./markdown-file";
import { renderMarkdown } from "./markdown";
import { escapeHtml } from "./escape-html";
import { getImage } from "./image-store";
import {
  markdownToDocx,
  markdownToHtmlDocument,
  markdownToOdt,
  markdownToRtf,
} from "./export-formats";
import { canvasToJpeg, jpegPagesToPdf, sliceCanvasToPages } from "./export-pdf";
import { renderArticleCanvas } from "./export-render";
import { pickExportDestination, writeExportDestination } from "./export-save";
import { buildEpub, chaptersFromNotes } from "./epub";
import { hydrateMermaidMarkup } from "./mermaid-render.ts";
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

function articleHtml(note: Note, markdown: string): string {
  if (note.format === "txt") {
    return `<pre class="plain-text">${escapeHtml(markdown)}</pre>`;
  }
  return renderMarkdown(markdown);
}

export async function exportNotes(options: {
  format: ExportFormat;
  note: Note;
  notes: Note[];
  onPicked?: () => void;
}): Promise<string> {
  const title = firstLineTitle(options.note.content);
  const filename = `${safeFilename(title)}.${EXT[options.format]}`;
  const destName =
    options.format === "epub" && options.note.bookId
      ? `${safeFilename(options.note.bookTitle || title)}.epub`
      : filename;
  const dest = await pickExportDestination(destName, MIME[options.format]);
  options.onPicked?.();

  const theme = readThemeConfig();
  const palette = paletteFor(theme);
  const markdown = await embedLocalImages(options.note.content);

  if (options.format === "html" || options.format === "html-plain") {
    const body = articleHtml(options.note, markdown);
    const hydrated = await hydrateMermaidMarkup(body, { palette });
    const bytes = markdownToHtmlDocument(markdown, {
      title,
      styled: options.format === "html",
      cssVars: cssVarsFromPalette(palette),
      plain: options.note.format === "txt",
      bodyHtml: hydrated,
    });
    return writeExportDestination(dest, bytes);
  }

  if (options.format === "rtf") {
    return writeExportDestination(dest, markdownToRtf(markdown));
  }
  if (options.format === "docx") {
    return writeExportDestination(dest, await markdownToDocx(markdown));
  }
  if (options.format === "odt") {
    return writeExportDestination(dest, await markdownToOdt(markdown));
  }
  if (options.format === "epub") {
    const siblings = options.note.bookId
      ? options.notes.filter((item) => item.bookId === options.note.bookId)
      : [options.note];
    const book = chaptersFromNotes(siblings, title);
    const bytes = await buildEpub({
      title: book.title,
      chapters: await Promise.all(
        book.chapters.map(async (chapter) => {
          const content = await embedLocalImages(chapter.content);
          return {
            ...chapter,
            content,
            html: await hydrateMermaidMarkup(renderMarkdown(content), { palette }),
          };
        }),
      ),
    });
    return writeExportDestination(dest, bytes);
  }

  const html = articleHtml(options.note, markdown);
  const rendered = await renderArticleCanvas(html, palette);
  if (options.format === "image") {
    const blob = await new Promise<Blob>((resolve, reject) => {
      rendered.canvas.toBlob(
        (value) => (value ? resolve(value) : reject(new Error("无法导出图片"))),
        "image/png",
      );
    });
    return writeExportDestination(dest, new Uint8Array(await blob.arrayBuffer()));
  }

  const pages = [];
  for (const slice of sliceCanvasToPages(rendered.canvas, {
    background: palette.bg,
    breaks: rendered.breaks,
    keeps: rendered.keeps,
  })) {
    pages.push({
      jpeg: await canvasToJpeg(slice),
      width: slice.width,
      height: slice.height,
    });
  }
  return writeExportDestination(dest, jpegPagesToPdf(pages));
}
