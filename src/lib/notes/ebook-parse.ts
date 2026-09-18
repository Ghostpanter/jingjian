import { splitHtmlChapters, splitPlainChapters, titleFromFilename } from "./ebook-chapters.ts";
import { looksLikeMobi, parseMobi } from "./ebook-mobi.ts";
import { parseEpub, type ParsedEpub } from "./epub.ts";
import { htmlToMarkdown } from "./html-to-markdown.ts";

export { splitHtmlChapters, splitPlainChapters, titleFromFilename } from "./ebook-chapters.ts";
export { decompressPalmDoc, looksLikeMobi, parseMobi } from "./ebook-mobi.ts";

export function decodeEbookBytes(bytes: Uint8Array): string {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }
  const utf8 = new TextDecoder("utf-8").decode(bytes);
  const bad = utf8.split("\uFFFD").length - 1;
  if (bad === 0) return utf8;
  try {
    const gbk = new TextDecoder("gb18030").decode(bytes);
    const gbkBad = gbk.split("\uFFFD").length - 1;
    if (gbkBad < bad) return gbk;
  } catch {
    // no gbk
  }
  return utf8;
}

function looksLikeZip(bytes: Uint8Array) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function looksLikeFb2(bytes: Uint8Array, name = "") {
  if (/\.(fb2|fbz)$/i.test(name) || /\.fb2\.zip$/i.test(name)) return true;
  const head = decodeEbookBytes(bytes.subarray(0, Math.min(bytes.length, 800)));
  return /<FictionBook\b/i.test(head);
}

function looksLikeHtml(bytes: Uint8Array, name = "") {
  if (/\.(html|htm)$/i.test(name)) return true;
  const head = decodeEbookBytes(bytes.subarray(0, Math.min(bytes.length, 400))).trim();
  return /^<(?:!doctype\s+html|html|head|body)\b/i.test(head);
}

function xmlText(source: string, tag: string): string {
  const match = source.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return match ? match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : "";
}

function b64Bytes(value: string): Uint8Array {
  const clean = value.replace(/\s+/g, "");
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let index = 0; index < bin.length; index += 1) out[index] = bin.charCodeAt(index);
  return out;
}

function fb2ToHtml(fragment: string): string {
  return fragment
    .replace(/<title[^>]*>([\s\S]*?)<\/title>/i, (_, title: string) => {
      const text = title.replace(/<\/?p[^>]*>/gi, "").replace(/\s+/g, " ").trim();
      return `<h1>${text}</h1>`;
    })
    .replace(/<subtitle[^>]*>([\s\S]*?)<\/subtitle>/gi, "<h3>$1</h3>")
    .replace(/<emphasis[^>]*>([\s\S]*?)<\/emphasis>/gi, "<em>$1</em>")
    .replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "<strong>$1</strong>")
    .replace(/<empty-line\s*\/?>/gi, "<br/>")
    .replace(/<v[^>]*>([\s\S]*?)<\/v>/gi, "$1<br/>")
    .replace(
      /<image\b[^>]*(?:l:href|xlink:href)=["']#?([^"']+)["'][^>]*\/?>/gi,
      '<img src="$1" alt="">',
    );
}

function extractSections(xml: string): string[] {
  const out: string[] = [];
  const lower = xml.toLowerCase();
  let search = 0;
  while (search < xml.length) {
    const start = lower.indexOf("<section", search);
    if (start < 0) break;
    const after = xml[start + 8];
    if (after && after !== ">" && after !== " " && after !== "\n" && after !== "\t") {
      search = start + 8;
      continue;
    }
    let depth = 1;
    let index = start + 8;
    let ended = false;
    while (index < xml.length && depth > 0) {
      const nextOpen = lower.indexOf("<section", index);
      const nextClose = lower.indexOf("</section>", index);
      if (nextClose < 0) break;
      if (nextOpen >= 0 && nextOpen < nextClose) {
        const ch = xml[nextOpen + 8];
        if (ch && ch !== ">" && ch !== " " && ch !== "\n" && ch !== "\t") {
          index = nextOpen + 8;
          continue;
        }
        depth += 1;
        index = nextOpen + 8;
      } else {
        depth -= 1;
        index = nextClose + 10;
        if (depth === 0) {
          out.push(xml.slice(start, index));
          search = index;
          ended = true;
        }
      }
    }
    if (!ended) search = start + 8;
  }
  return out;
}

function leafSections(xml: string): string[] {
  const sections = extractSections(xml);
  if (sections.length === 0) return [xml];
  const leaves: string[] = [];
  for (const section of sections) {
    const inner = section.replace(/^<section[^>]*>/i, "").replace(/<\/section>\s*$/i, "");
    const nested = extractSections(inner);
    if (nested.length) leaves.push(...leafSections(inner));
    else leaves.push(section);
  }
  return leaves;
}

export async function parseFb2(bytes: Uint8Array): Promise<ParsedEpub> {
  let xmlBytes = bytes;
  if (looksLikeZip(bytes)) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(bytes);
    const name = Object.keys(zip.files).find((file) => /\.fb2$/i.test(file) && !zip.files[file].dir);
    if (!name) throw new Error("压缩包里没有 FB2");
    xmlBytes = await zip.file(name)!.async("uint8array");
  }
  const xml = decodeEbookBytes(xmlBytes);
  const titleInfo = xml.match(/<title-info[^>]*>([\s\S]*?)<\/title-info>/i)?.[1] || xml;
  const title = xmlText(titleInfo, "book-title") || "未命名电子书";
  const first = xmlText(titleInfo, "first-name");
  const last = xmlText(titleInfo, "last-name");
  const nick = xmlText(titleInfo, "nickname");
  const author = [first, last].filter(Boolean).join(" ") || nick || undefined;
  const images: ParsedEpub["images"] = [];
  for (const match of xml.matchAll(/<binary\b([^>]*)>([\s\S]*?)<\/binary>/gi)) {
    const id = match[1].match(/\bid=["']([^"']+)["']/i)?.[1];
    const mime = match[1].match(/\bcontent-type=["']([^"']+)["']/i)?.[1] || "image/jpeg";
    if (!id) continue;
    images.push({ href: id, mime, bytes: b64Bytes(match[2]) });
  }
  const coverId = titleInfo.match(/<coverpage[\s\S]*?(?:l:href|xlink:href)=["']#?([^"']+)["']/i)?.[1];
  const cover = images.find((image) => image.href === coverId);
  const bodies = [...xml.matchAll(/<body\b([^>]*)>([\s\S]*?)<\/body>/gi)].filter((match) => {
    const name = match[1].match(/\bname=["']([^"']+)["']/i)?.[1] || "";
    return !/notes|comments|footnotes/i.test(name);
  });
  const body = bodies[0]?.[2] || xml;
  const chapters = leafSections(body)
    .map((section, index) => {
      const heading = xmlText(section, "title") || `第 ${index + 1} 章`;
      const html = fb2ToHtml(section);
      const content = htmlToMarkdown(html);
      if (!content.trim()) return null;
      return {
        title: heading,
        content: content.trim().startsWith("#") ? content.trim() : `# ${heading}\n\n${content.trim()}`,
      };
    })
    .filter((chapter): chapter is NonNullable<typeof chapter> => Boolean(chapter));
  if (!chapters.length) throw new Error("这本电子书没有可阅读的章节");
  return {
    title,
    author,
    cover: cover ? { href: cover.href, mime: cover.mime, bytes: cover.bytes } : undefined,
    chapters,
    images,
  };
}

export function parseHtmlEbook(bytes: Uint8Array, name = ""): ParsedEpub {
  const html = decodeEbookBytes(bytes);
  const title =
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.replace(/<[^>]+>/g, "").trim() ||
    titleFromFilename(name);
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const chapters = splitHtmlChapters(body, title);
  if (!chapters.length) throw new Error("这本电子书没有可阅读的章节");
  return { title, chapters, images: [] };
}

export function parseTxtEbook(text: string, title: string): ParsedEpub | null {
  const chapters = splitPlainChapters(text, title);
  if (chapters.length < 2) return null;
  return { title, chapters, images: [] };
}

export async function parseEbook(
  bytes: ArrayBuffer | Uint8Array,
  name = "",
): Promise<ParsedEpub> {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const lower = name.toLowerCase();
  if (looksLikeZip(raw) || /\.epub$/i.test(lower)) {
    try {
      return await parseEpub(raw);
    } catch (error) {
      if (looksLikeFb2(raw, lower) || /\.(fb2|fbz|zip)$/i.test(lower)) {
        return parseFb2(raw);
      }
      throw error instanceof Error ? error : new Error("无法打开电子书");
    }
  }
  if (looksLikeFb2(raw, lower)) return parseFb2(raw);
  if (looksLikeMobi(raw, lower)) return parseMobi(raw, name);
  if (looksLikeHtml(raw, lower)) return parseHtmlEbook(raw, name);
  if (/\.txt$/i.test(lower)) {
    const title = titleFromFilename(name);
    const parsed = parseTxtEbook(decodeEbookBytes(raw), title);
    if (parsed) return parsed;
    const text = decodeEbookBytes(raw).trim();
    if (!text) throw new Error("这本电子书没有可阅读的章节");
    return { title, chapters: [{ title, content: text }], images: [] };
  }
  throw new Error("暂不支持该电子书格式");
}
