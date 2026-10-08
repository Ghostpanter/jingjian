import { escapeHtml } from "./escape-html.ts";
import { firstLineTitle } from "./format.ts";
import { renderMarkdown } from "./markdown.ts";
import type { NoteFormat } from "./types.ts";

/** Same window as on-screen preview, so a huge file does not freeze the print layout. */
export const PRINT_CHAPTER_CHARS = 48_000;
/** Stop adding later chapters once the paper is already this long. */
export const PRINT_TOTAL_CHARS = 120_000;

export const PRINT_SYSTEM_INTRO =
  "打印机用系统里已经配好的，静笺不单独直连。电脑：在系统设置里添加打印机后，点「打印」打开系统打印窗口。安卓：先在系统「打印」里添加打印机，或保存为 PDF。网页：用浏览器的打印窗口，也可以另存为 PDF。先看纸面排版，确认后再打印。";

export type PrintScope = "chapter" | "book";

export type PrintNote = {
  id: string;
  content: string;
  format?: NoteFormat;
  bookId?: string;
  bookTitle?: string;
  chapterIndex?: number;
};

export type PrintSection = {
  heading?: string;
  content: string;
  format: NoteFormat;
  truncated: boolean;
};

const PRINT_CSS = `
@page { size: A4; margin: 16mm 16mm 18mm; }
@page { @bottom-center { content: counter(page); font-size: 9pt; color: #6a6358; } }
html { background: #e6e0d4; color-scheme: light; }
body { margin: 0; color: #1a1814; font-family: "Noto Serif SC", "Songti SC", "Source Han Serif SC", "Noto Serif CJK SC", Georgia, serif; }
.print-sheet { box-sizing: border-box; width: min(210mm, 100%); min-height: 100vh; margin: 0 auto; padding: 14mm 12mm 16mm; background: #fff; color: #1a1814; }
.print-book-title { margin: 0 0 1.2rem; font-size: 1.8rem; line-height: 1.3; font-weight: 600; }
.print-kicker { margin: 0 0 0.85rem; font-size: 1.35rem; line-height: 1.35; font-weight: 600; }
.print-chapter + .print-chapter { margin-top: 2rem; padding-top: 1.25rem; border-top: 1px dashed #d5cbb8; break-before: page; page-break-before: always; }
.print-clip, .print-empty { margin: 0 0 1rem; color: #6a6358; font-size: 0.92rem; line-height: 1.55; }
.print-clip { padding: 0.55rem 0.75rem; border: 1px solid #d5cbb8; background: #f7f3eb; }
.md-body { font-size: 12pt; line-height: 1.75; overflow-wrap: break-word; word-break: normal; text-autospace: ideograph-alpha ideograph-numeric; }
.md-body h1, .md-body h2, .md-body h3, .md-body h4, .md-body h5, .md-body h6 { line-height: 1.35; font-weight: 600; overflow-wrap: break-word; }
.md-body h1 { font-size: 1.7rem; margin: 0 0 0.75em; }
.md-body h2 { font-size: 1.35rem; margin: 1.35em 0 0.5em; }
.md-body h3 { font-size: 1.15rem; margin: 1.2em 0 0.4em; }
.md-body p, .md-body blockquote, .md-body table, .md-body ul, .md-body ol, .md-body pre, .md-body .callout { margin: 0 0 0.9rem; }
.md-body ul, .md-body ol { padding-left: 1.5em; }
.md-body li { margin: 0 0 0.35rem; }
.md-body a { color: #2c4a42; }
.md-body blockquote { padding-left: 0.9rem; border-left: 3px solid #2c4a42; color: #6a6358; }
.md-body code { font-family: ui-monospace, "Sarasa Mono SC", monospace; background: #f4efe6; border-radius: 4px; padding: 0.05em 0.3em; }
.md-body pre { background: #f4efe6; border-radius: 8px; padding: 0.8rem 0.9rem; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
.md-body pre code { background: transparent; padding: 0; }
.md-body pre.plain-text { background: transparent; padding: 0; font-family: inherit; font-size: inherit; white-space: pre-wrap; }
.md-body img, .md-body svg, .md-body .mermaid-svg, .md-body .mermaid-image { max-width: 100%; height: auto; }
.md-body table { border-collapse: collapse; width: 100%; }
.md-body th, .md-body td { border-bottom: 1px solid #d5cbb8; padding: 0.35rem 0.45rem; text-align: left; vertical-align: top; }
.md-body .callout { padding: 0.7rem 0.9rem; background: #f4efe6; border-left: 3px solid #2c4a42; }
.md-body .callout-title { margin: 0 0 0.3rem; font-size: 0.85rem; font-weight: 600; }
.md-body .footnotes { margin-top: 1.5rem; padding-top: 0.7rem; border-top: 1px solid #d5cbb8; font-size: 0.9em; color: #6a6358; }
.md-body .code-copy { display: none; }
.md-body input.task-toggle { pointer-events: none; }
.katex-display { display: block; margin: 0.8rem 0; text-align: center; overflow-x: auto; }
@media print {
  html, body { background: #fff; }
  .print-sheet { width: auto; min-height: 0; margin: 0; padding: 0; }
  .print-chapter + .print-chapter { margin-top: 0; padding-top: 0; border-top: 0; }
}
`.trim();

function chapterLabel(note: PrintNote): string {
  const title = firstLineTitle(note.content);
  if (title && title !== "未命名笔记") return title;
  return `第${(note.chapterIndex ?? 0) + 1}章`;
}

export function selectPrintNotes(
  notes: PrintNote[],
  activeId: string,
  scope: PrintScope,
): PrintNote[] {
  const active = notes.find((note) => note.id === activeId);
  if (!active) return [];
  if (scope !== "book" || !active.bookId) return [active];
  return notes
    .filter((note) => note.bookId === active.bookId)
    .sort(
      (a, b) =>
        (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0) || a.id.localeCompare(b.id),
    );
}

export function printJobTitle(notes: PrintNote[]): string {
  const book = notes.find((note) => note.bookTitle?.trim())?.bookTitle?.trim();
  const first = notes[0];
  if (!first) return "静笺";
  if (book && notes.length > 1) return book;
  const chapter = firstLineTitle(first.content);
  if (book && chapter && chapter !== "未命名笔记") return `${book} · ${chapter}`;
  if (book) return book;
  return chapter || "静笺";
}

export function windowPrintNotes(notes: PrintNote[]): {
  sections: PrintSection[];
  truncated: boolean;
  omittedChapters: number;
} {
  const sections: PrintSection[] = [];
  let used = 0;
  let omittedChapters = 0;
  for (let index = 0; index < notes.length; index += 1) {
    const note = notes[index];
    if (!note) continue;
    if (used >= PRINT_TOTAL_CHARS && notes.length > 1) {
      omittedChapters += notes.length - index;
      break;
    }
    const format = note.format === "txt" ? "txt" : "md";
    const heading = note.bookId ? chapterLabel(note) : undefined;
    const content = note.content;
    if (content.length === 0) {
      sections.push({ heading, content: "", format, truncated: false });
      continue;
    }
    let offset = 0;
    let first = true;
    while (offset < content.length) {
      let end = Math.min(content.length, offset + PRINT_CHAPTER_CHARS);
      if (end < content.length) {
        const nl = content.lastIndexOf("\n", end);
        if (nl > offset + Math.floor(PRINT_CHAPTER_CHARS / 2)) end = nl;
      }
      const piece = content.slice(offset, end);
      sections.push({
        heading: first ? heading : undefined,
        content: piece,
        format,
        truncated: false,
      });
      used += piece.length;
      offset = end;
      first = false;
    }
  }
  return { sections, truncated: omittedChapters > 0, omittedChapters };
}

function startsWithHeading(content: string, heading: string): boolean {
  const line = content.trimStart().split("\n", 1)[0] ?? "";
  return line.replace(/^#{1,6}\s*/, "").trim() === heading;
}

function sectionHtml(section: PrintSection): string {
  const heading =
    section.heading && !startsWithHeading(section.content, section.heading)
      ? `<h2 class="print-kicker">${escapeHtml(section.heading)}</h2>`
      : "";
  const notice = section.truncated
    ? `<p class="print-clip">这篇较长，纸面只排了开头。后面的文字仍在笔记里。</p>`
    : "";
  const body = section.content.trim()
    ? section.format === "txt"
      ? `<pre class="plain-text">${escapeHtml(section.content)}</pre>`
      : renderMarkdown(section.content)
    : `<p class="print-empty">这篇是空的。</p>`;
  return `<section class="print-chapter">${heading}${notice}${body}</section>`;
}

function printArticle(options: {
  title: string;
  sections: PrintSection[];
  omittedChapters?: number;
}): { title: string; article: string } {
  const title = options.title.trim() || "静笺";
  const bookTitle =
    options.sections.length > 1
      ? `<h1 class="print-book-title">${escapeHtml(title)}</h1>`
      : "";
  const omitted = options.omittedChapters ?? 0;
  const omittedNote =
    omitted > 0
      ? `<p class="print-clip">还有 ${omitted} 章没有排进这次预览，可以再选后面的章节分开打印。</p>`
      : "";
  const body = options.sections.map(sectionHtml).join("") || `<p class="print-empty">这篇是空的。</p>`;
  return {
    title,
    article: `<article class="print-sheet md-body">${bookTitle}${body}${omittedNote}</article>`,
  };
}

export function wrapPrintHtml(title: string, articleHtml: string): string {
  const safeTitle = title.trim() || "静笺";
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(safeTitle)}</title><style>${PRINT_CSS}</style></head><body>${articleHtml}</body></html>`;
}

/** Markup for the in-app preview. Kept out of an iframe so closing it cannot replace the app page. */
export function printPreviewMarkup(articleHtml: string): string {
  return `<style>:host{display:block;background:#e6e0d4;min-height:100%;}${PRINT_CSS}</style>${articleHtml}`;
}

export function buildPrintArticle(options: {
  title: string;
  sections: PrintSection[];
  omittedChapters?: number;
}): string {
  return printArticle(options).article;
}

export function buildPrintDocument(options: {
  title: string;
  sections: PrintSection[];
  omittedChapters?: number;
}): string {
  const built = printArticle(options);
  return wrapPrintHtml(built.title, built.article);
}
