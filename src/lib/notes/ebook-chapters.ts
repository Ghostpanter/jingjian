import { htmlToMarkdown } from "./html-to-markdown.ts";
import type { EpubChapter } from "./epub.ts";

const CHAPTER_LINE =
  /^(?:楔子|序章|引子|前言|后记|尾声|番外(?:.{0,40})?|第[0-9零〇一二三四五六七八九十百千万两]+[章节回卷部篇集](?:[、.．:：\s].{0,80})?|(?:Chapter|CHAPTER|chapter)\s+\d+(?:[.:：\s].{0,80})?)$/;

export function titleFromFilename(name: string): string {
  const base = name
    .replace(/^.*[/\\]/, "")
    .replace(/\.fb2\.zip$/i, "")
    .replace(/\.(epub|mobi|azw3|azw|prc|fb2|fbz|html|htm|txt)$/i, "")
    .trim();
  return base || "未命名电子书";
}

export function isChapterLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 80) return false;
  return CHAPTER_LINE.test(trimmed);
}

export function splitPlainChapters(
  text: string,
  fallbackTitle: string,
): EpubChapter[] {
  const normalized = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const marks: Array<{ index: number; title: string }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (isChapterLine(lines[index])) {
      marks.push({ index, title: lines[index].trim() });
    }
  }
  if (marks.length < 2) {
    const trimmed = normalized.trim();
    return trimmed ? [{ title: fallbackTitle, content: trimmed }] : [];
  }
  const chapters: EpubChapter[] = [];
  const preface = lines.slice(0, marks[0].index).join("\n").trim();
  if (preface) chapters.push({ title: fallbackTitle, content: preface });
  for (let index = 0; index < marks.length; index += 1) {
    const start = marks[index].index;
    const end = index + 1 < marks.length ? marks[index + 1].index : lines.length;
    const body = lines.slice(start + 1, end).join("\n").trim();
    const content = body ? `# ${marks[index].title}\n\n${body}` : `# ${marks[index].title}`;
    chapters.push({ title: marks[index].title, content });
  }
  return chapters;
}

function headingTitle(html: string): string {
  const heading = html.match(/<h[1-3][^>]*>([\s\S]*?)<\/h[1-3]>/i);
  if (heading) return heading[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  const line = html
    .replace(/<[^>]+>/g, "\n")
    .split("\n")
    .map((item) => item.trim())
    .find(Boolean);
  return line && isChapterLine(line) ? line : "";
}

function chapterFromHtml(html: string, fallback: string): EpubChapter | null {
  const trimmed = html.trim();
  if (!trimmed) return null;
  const title = headingTitle(trimmed) || fallback;
  const markdown = htmlToMarkdown(trimmed);
  if (!markdown.trim()) return null;
  const content = markdown.trim().startsWith("#")
    ? markdown.trim()
    : `# ${title}\n\n${markdown.trim()}`;
  return { title, content, html: trimmed };
}

export function splitHtmlChapters(html: string, fallbackTitle: string): EpubChapter[] {
  const source = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  const pagebreaks = source
    .split(/<mbp:pagebreak\b[^>]*\/?>/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (pagebreaks.length >= 2) {
    return pagebreaks
      .map((part, index) => chapterFromHtml(part, `${fallbackTitle} ${index + 1}`))
      .filter((chapter): chapter is EpubChapter => Boolean(chapter));
  }
  for (const tag of ["h1", "h2"] as const) {
    const matches = [...source.matchAll(new RegExp(`<${tag}\\b[^>]*>`, "gi"))];
    if (matches.length < 2) continue;
    const chapters: EpubChapter[] = [];
    const preface = source.slice(0, matches[0].index);
    const pre = chapterFromHtml(preface, fallbackTitle);
    if (pre && htmlToMarkdown(preface).replace(/^#+\s+.+$/m, "").trim()) {
      chapters.push(pre);
    }
    for (let index = 0; index < matches.length; index += 1) {
      const start = matches[index].index ?? 0;
      const end = index + 1 < matches.length ? (matches[index + 1].index ?? source.length) : source.length;
      const next = chapterFromHtml(source.slice(start, end), `${fallbackTitle} ${index + 1}`);
      if (next) chapters.push(next);
    }
    if (chapters.length >= 2) return chapters;
  }
  const single = chapterFromHtml(source, fallbackTitle);
  if (single) return [single];
  const plain = splitPlainChapters(htmlToMarkdown(source), fallbackTitle);
  return plain;
}
