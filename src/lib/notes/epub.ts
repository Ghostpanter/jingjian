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
  author?: string;
  cover?: { href: string; mime: string; bytes: Uint8Array };
  chapters: EpubChapter[];
  images: Array<{ href: string; mime: string; bytes: Uint8Array }>;
};

function xmlText(source: string, tag: string): string {
  const match = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, "").trim() : "";
}

function xmlTexts(source: string, tag: string): string[] {
  return [...source.matchAll(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map(
    (match) => match[1].replace(/<[^>]+>/g, "").trim(),
  ).filter(Boolean);
}

function attr(tag: string, name: string): string {
  const match = tag.match(new RegExp(`${name}="([^"]+)"`, "i"));
  return match?.[1] ?? "";
}

function resolveHref(base: string, href: string): string {
  const clean = href.split("#")[0].replace(/\\/g, "/");
  if (!clean) return "";
  if (clean.startsWith("/")) return clean.replace(/^\/+/, "");
  const parts = base.split("/").slice(0, -1);
  for (const segment of clean.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}

function basename(path: string): string {
  return path.split("/").pop()?.toLowerCase() || path.toLowerCase();
}

export function isSkippableEpubPart(title: string, href: string): boolean {
  const file = basename(href).replace(/\.(xhtml|html|htm|xml)$/i, "");
  if (/^(cover|toc|nav|ncx|titlepage|title-page|copyright|colophon|contents|cover-page)$/i.test(file)) {
    return true;
  }
  return /^(封面|目录|版权|献词|扉页|版权信息|copyright|cover|table of contents|title page|titlepage)$/i.test(
    title.trim(),
  );
}

export function tocEntriesFromHtml(html: string, base: string): Array<{ href: string; title: string }> {
  const nav =
    html.match(/<nav[^>]*epub:type=["']toc["'][^>]*>([\s\S]*?)<\/nav>/i)?.[1] ||
    html.match(/<nav[^>]*>([\s\S]*?)<\/nav>/i)?.[1] ||
    html;
  const out: Array<{ href: string; title: string }> = [];
  const seen = new Set<string>();
  for (const match of nav.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = resolveHref(base, attr(match[1], "href"));
    const title = match[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, title });
  }
  return out;
}

export function tocEntriesFromNcx(xml: string, base: string): Array<{ href: string; title: string }> {
  const out: Array<{ href: string; title: string }> = [];
  const seen = new Set<string>();
  for (const match of xml.matchAll(
    /<navLabel>[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content\b[^>]*src="([^"]+)"/gi,
  )) {
    const title = match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    const href = resolveHref(base, match[2]);
    if (!href || !title || seen.has(href)) continue;
    seen.add(href);
    out.push({ href, title });
  }
  return out;
}

function headingFromHtml(html: string): string {
  const heading = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return heading ? heading[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

function chapterStartsWithTitle(content: string, title: string): boolean {
  const first = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || "";
  return first === title;
}

export async function buildEpub(options: {
  title: string;
  author?: string;
  cover?: { mime: string; bytes: Uint8Array };
  chapters: EpubChapter[];
}): Promise<Uint8Array> {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const chapters = options.chapters.length
    ? options.chapters
    : [{ title: options.title, content: "" }];
  const coverExt = options.cover?.mime.includes("png")
    ? "png"
    : options.cover?.mime.includes("webp")
      ? "webp"
      : "jpg";
  const coverName = options.cover ? `cover.${coverExt}` : "";
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file(
    "META-INF/container.xml",
    `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`,
  );
  const nav = chapters
    .map(
      (chapter, index) =>
        `<li><a href="ch${String(index + 1).padStart(3, "0")}.xhtml">${xml(chapter.title)}</a></li>`,
    )
    .join("\n");
  const coverManifest = options.cover
    ? `<item id="cover-image" href="${coverName}" media-type="${xml(options.cover.mime)}" properties="cover-image"/>
    <item id="coverpage" href="cover.xhtml" media-type="application/xhtml+xml"/>`
    : "";
  const coverSpine = options.cover ? `<itemref idref="coverpage"/>` : "";
  const manifest = chapters
    .map(
      (_, index) =>
        `<item id="ch${index + 1}" href="ch${String(index + 1).padStart(3, "0")}.xhtml" media-type="application/xhtml+xml"/>`,
    )
    .join("\n    ");
  const spine = chapters
    .map((_, index) => `<itemref idref="ch${index + 1}"/>`)
    .join("\n    ");
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  zip.file(
    "OEBPS/content.opf",
    `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${xml(options.title)}</dc:title>
    <dc:language>zh-CN</dc:language>
    <dc:creator>${xml(options.author || "静笺")}</dc:creator>
    <dc:identifier id="bookid">urn:uuid:${crypto.randomUUID()}</dc:identifier>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    ${coverManifest}
    ${manifest}
  </manifest>
  <spine>
    ${coverSpine}
    ${spine}
  </spine>
</package>`,
  );
  zip.file(
    "OEBPS/nav.xhtml",
    `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>${xml(options.title)}</title></head>
<body>
<nav epub:type="toc">
<ol>
${nav}
</ol>
</nav>
</body>
</html>`,
  );
  zip.file(
    "OEBPS/styles.css",
    `body { font-family: "Noto Serif SC", serif; line-height: 1.7; margin: 1.2em; }
h1, h2, h3 { line-height: 1.3; }
img, svg { max-width: 100%; height: auto; display: block; margin: 0 auto; }`,
  );
  if (options.cover) {
    zip.file(`OEBPS/${coverName}`, options.cover.bytes);
    zip.file(
      "OEBPS/cover.xhtml",
      `<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>封面</title><link rel="stylesheet" href="styles.css"/></head>
<body><img src="${coverName}" alt="${xml(options.title)}"/></body>
</html>`,
    );
  }
  chapters.forEach((chapter, index) => {
    const body = xhtmlFromMarkdown(chapter.content, chapter.html);
    const heading =
      chapterStartsWithTitle(chapter.content, chapter.title) || /<h1[\s>]/i.test(body)
        ? ""
        : `<h1>${xml(chapter.title)}</h1>`;
    zip.file(
      `OEBPS/ch${String(index + 1).padStart(3, "0")}.xhtml`,
      `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN">
<head><meta charset="utf-8"/><title>${xml(chapter.title)}</title><link rel="stylesheet" href="styles.css"/></head>
<body>${heading}${body}</body>
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
  const author = xmlTexts(opf, "dc:creator").join("、") || undefined;
  const items = new Map<string, { href: string; media: string; properties: string }>();
  for (const match of opf.matchAll(/<item\b([^>]+)\/?>/gi)) {
    const tag = match[1];
    const id = attr(tag, "id");
    if (!id) continue;
    items.set(id, {
      href: attr(tag, "href"),
      media: attr(tag, "media-type"),
      properties: attr(tag, "properties"),
    });
  }
  const spineIds = [...opf.matchAll(/<itemref\b([^>]+)\/?>/gi)].map((match) =>
    attr(match[1], "idref"),
  );
  const coverMeta = opf.match(/<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i)?.[1];
  const coverItem =
    (coverMeta ? items.get(coverMeta) : undefined) ||
    [...items.values()].find((item) => /cover-image/i.test(item.properties)) ||
    [...items.values()].find((item) => /^image\//i.test(item.media) && /cover/i.test(item.href));

  let toc: Array<{ href: string; title: string }> = [];
  const navItem =
    [...items.values()].find((item) => /\bnav\b/i.test(item.properties)) ||
    [...items.values()].find((item) => /nav\.xhtml$/i.test(item.href));
  const ncxItem = [...items.values()].find((item) => /ncx/i.test(item.media) || /toc\.ncx$/i.test(item.href));
  if (navItem) {
    const navPath = resolveHref(opfPath, navItem.href);
    const navHtml = await zip.file(navPath)?.async("string");
    if (navHtml) toc = tocEntriesFromHtml(navHtml, navPath);
  } else if (ncxItem) {
    const ncxPath = resolveHref(opfPath, ncxItem.href);
    const ncx = await zip.file(ncxPath)?.async("string");
    if (ncx) toc = tocEntriesFromNcx(ncx, ncxPath);
  }
  const tocByHref = new Map(toc.map((entry) => [entry.href, entry.title]));

  const images: ParsedEpub["images"] = [];
  const chapters: EpubChapter[] = [];
  const used = new Set<string>();

  async function addChapter(href: string, fallbackTitle: string) {
    if (used.has(href)) return;
    const file = zip.file(href);
    if (!file) return;
    const html = await file.async("string");
    if (!html) return;
    const rewritten = html.replace(
      /src=["']([^"']+)["']/gi,
      (full, src: string) => {
        if (/^https?:/i.test(src) || src.startsWith("data:")) return full;
        const resolved = resolveHref(href, src.split("#")[0]);
        return `src="${resolved}"`;
      },
    );
    const tocTitle = tocByHref.get(href);
    const titleFromDoc = headingFromHtml(rewritten);
    const chapterTitle = tocTitle || titleFromDoc || fallbackTitle;
    if (isSkippableEpubPart(chapterTitle, href) && chapters.length === 0 && toc.length > 0) {
      used.add(href);
      return;
    }
    used.add(href);
    chapters.push({
      title: chapterTitle || `第 ${chapters.length + 1} 章`,
      content: htmlToMarkdown(rewritten),
    });
  }

  if (toc.length > 0) {
    for (const entry of toc) {
      if (isSkippableEpubPart(entry.title, entry.href)) continue;
      await addChapter(entry.href, entry.title);
    }
  }
  for (const id of spineIds) {
    const item = items.get(id);
    if (!item || !/xhtml|html|xml/i.test(item.media || "xhtml")) continue;
    if (/\bnav\b/i.test(item.properties) || /ncx/i.test(item.media)) continue;
    const href = resolveHref(opfPath, item.href);
    if (used.has(href)) continue;
    if (isSkippableEpubPart("", href)) continue;
    await addChapter(href, `第 ${chapters.length + 1} 章`);
  }

  for (const [, item] of items) {
    if (!/^image\//i.test(item.media)) continue;
    const href = resolveHref(opfPath, item.href);
    const file = zip.file(href);
    if (!file) continue;
    const bytesOut = await file.async("uint8array");
    images.push({ href, mime: item.media, bytes: bytesOut });
  }

  let cover: ParsedEpub["cover"];
  if (coverItem) {
    const href = resolveHref(opfPath, coverItem.href);
    const found = images.find((image) => image.href === href);
    if (found) cover = { href, mime: found.mime, bytes: found.bytes };
  }

  if (chapters.length === 0) {
    throw new Error("这本电子书没有可阅读的章节");
  }
  return { title, author, cover, chapters, images };
}

export function notesFromEpub(
  parsed: ParsedEpub,
  now = Date.now(),
  coverSrc?: string,
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
      ...(parsed.author ? { bookAuthor: parsed.author } : {}),
      ...(coverSrc ? { bookCover: coverSrc } : {}),
      chapterIndex: index,
    };
  });
}

export function chaptersFromNotes(notes: Note[], fallbackTitle: string): {
  title: string;
  author?: string;
  cover?: string;
  chapters: EpubChapter[];
} {
  const ordered = [...notes].sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0));
  const book = ordered[0]?.bookTitle || fallbackTitle;
  const author = ordered.find((note) => note.bookAuthor)?.bookAuthor;
  const cover = ordered.find((note) => note.bookCover)?.bookCover;
  const chapters = ordered.map((note) => ({
    title: firstLineTitle(note.content),
    content: note.content,
  }));
  return { title: book, author, cover, chapters };
}
