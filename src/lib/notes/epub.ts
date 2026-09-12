import { escapeHtml } from "./escape-html.ts";
import { htmlToMarkdown } from "./html-to-markdown.ts";
import { xhtmlFromMarkdown } from "./export-formats.ts";
import { firstLineTitle } from "./markdown-file.ts";
import type { Note } from "./types.ts";

function xml(value: string): string {
  return escapeHtml(value);
}

export type EpubChapter = {
  title: string;
  content: string;
  html?: string;
};

export type ParsedEpub = {
  title: string;
  chapters: EpubChapter[];
  images: Array<{ href: string; mime: string; bytes: Uint8Array }>;
};

function xmlText(source: string, tag: string): string {
  const match = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]+)"`, "i"));
  return match?.[1] ?? "";
}

function resolveHref(base: string, href: string): string {
  if (!href || href.startsWith("/")) return href.replace(/^\/+/, "");
  const parts = base.split("/").slice(0, -1);
  for (const segment of href.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

export async function buildEpub(options: {
  title: string;
  author?: string;
  chapters: EpubChapter[];
}): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const chapters = options.chapters.length
    ? options.chapters
    : [{ title: options.title, content: "" }];
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  const manifest = chapters
    .map(
      (_, index) =>
        `<item id="ch${index + 1}" href="ch${String(index + 1).padStart(3, "0")}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n    ");
  const spine = chapters
    .map((_, index) => `<itemref idref="ch${index + 1}"/>`)
    .join("\n    ");
  const nav = chapters
    .map(
      (chapter, index) =>
        `<li><a href="ch${String(index + 1).padStart(3, "0")}.xhtml">${xml(chapter.title)}</a></li>`,
    )
    .join("\n");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="2.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${xml(options.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>${xml(options.author || "静笺")}</dc:creator>
    <dc:identifier id="bookid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
  </metadata>
  <manifest>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${manifest}
  </manifest>
  <spine toc="ncx">
    ${spine}
  </spine>
</package>`,
  );
  zip.file(
    "OEBPS/toc.ncx",
    `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="jingjian"/></head>
  <docTitle><text>${xml(options.title)}</text></docTitle>
  <navMap>
    ${chapters
      .map(
        (chapter, index) => `<navPoint id="n${index + 1}" playOrder="${index + 1}">
      <navLabel><text>${xml(chapter.title)}</text></navLabel>
      <content src="ch${String(index + 1).padStart(3, "0")}.xhtml"/>
    </navPoint>`,
      )
      .join("\n    ")}
  </navMap>
</ncx>`,
  );
  zip.file(
    "OEBPS/styles.css",
    `body { font-family: "Noto Serif SC", serif; line-height: 1.7; margin: 1.2em; }
h1, h2, h3 { line-height: 1.3; }
img, svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }`,
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><nav><ol>${nav}</ol></nav></body></html>`,
  );
  chapters.forEach((chapter, index) => {
    const body = xhtmlFromMarkdown(chapter.content, chapter.html);
    zip.file(
      `OEBPS/ch${String(index + 1).padStart(3, "0")}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>${xml(chapter.title)}</title><link rel="stylesheet" href="styles.css"/></head>
<body><h1>${xml(chapter.title)}</h1>${body}</body>
</html>`,
    );
  });
  return zip.generateAsync({ type: "uint8array", mimeType: "application/epub+zip" });
}

export async function parseEpub(bytes: ArrayBuffer | Uint8Array): Promise<ParsedEpub> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(bytes);
  const container = await zip.file("META-INF/container.xml")?.async("string");
  if (!container) throw new Error("不是有效的 EPUB");
  const rootMatch = container.match(/full-path="([^"]+)"/);
  if (!rootMatch) throw new Error("找不到 EPUB 目录");
  const opfPath = rootMatch[1];
  const opf = await zip.file(opfPath)?.async("string");
  if (!opf) throw new Error("找不到 content.opf");
  const title =
    xmlText(opf, "dc:title") ||
    xmlText(opf, "title") ||
    "未命名电子书";
  const items = new Map<string, { href: string; media: string }>();
  for (const match of opf.matchAll(/<item\b([^>]+)\/>/gi)) {
    const tag = match[1];
    items.set(attr(tag, "id"), {
      href: attr(tag, "href"),
      media: attr(tag, "media-type"),
    });
  }
  const spineIds = [...opf.matchAll(/<itemref\b([^>]+)\/>/gi)].map((match) =>
    attr(match[1], "idref"),
  );
  const images: ParsedEpub["images"] = [];
  const chapters: EpubChapter[] = [];
  for (const id of spineIds) {
    const item = items.get(id);
    if (!item || !/xhtml|html|xml/i.test(item.media || "xhtml")) continue;
    const href = resolveHref(opfPath, item.href);
    const html = await zip.file(href)?.async("string");
    if (!html) continue;
    const rewritten = html.replace(
      /src=["']([^"']+)["']/gi,
      (full, src: string) => {
        if (/^https?:/i.test(src) || src.startsWith("data:")) return full;
        const resolved = resolveHref(href, src.split("#")[0]);
        return `src="${resolved}"`;
      },
    );
    const heading = rewritten.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const chapterTitle = heading
      ? heading[1].replace(/<[^>]+>/g, "").trim()
      : `第 ${chapters.length + 1} 章`;
    chapters.push({
      title: chapterTitle || `第 ${chapters.length + 1} 章`,
      content: htmlToMarkdown(rewritten),
    });
  }
  for (const [, item] of items) {
    if (!/^image\//i.test(item.media)) continue;
    const href = resolveHref(opfPath, item.href);
    const file = zip.file(href);
    if (!file) continue;
    const bytesOut = await file.async("uint8array");
    images.push({ href, mime: item.media, bytes: bytesOut });
  }
  if (chapters.length === 0) {
    throw new Error("这本电子书没有可阅读的章节");
  }
  return { title, chapters, images };
}

export function notesFromEpub(
  parsed: ParsedEpub,
  now = Date.now(),
): Note[] {
  const bookId = crypto.randomUUID();
  return parsed.chapters.map((chapter, index) => {
    const heading = chapter.content.trim().startsWith("#")
      ? chapter.content.trim()
      : `# ${chapter.title}\n\n${chapter.content.trim()}`;
    return {
      id: crypto.randomUUID(),
      content: `${heading}\n`,
      createdAt: now + index,
      updatedAt: now + index,
      bookId,
      bookTitle: parsed.title,
      chapterIndex: index,
    };
  });
}

export function chaptersFromNotes(notes: Note[], fallbackTitle: string): {
  title: string;
  chapters: EpubChapter[];
} {
  const book = notes[0]?.bookTitle || fallbackTitle;
  const chapters = [...notes]
    .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0))
    .map((note) => ({
      title: firstLineTitle(note.content),
      content: note.content,
    }));
  return { title: book, chapters };
}
