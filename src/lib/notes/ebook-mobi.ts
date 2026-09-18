import { splitHtmlChapters, titleFromFilename } from "./ebook-chapters.ts";
import type { ParsedEpub } from "./epub.ts";

function u16(view: DataView, offset: number) {
  return view.getUint16(offset, false);
}

function u32(view: DataView, offset: number) {
  return view.getUint32(offset, false);
}

export function decompressPalmDoc(data: Uint8Array): Uint8Array {
  const output: number[] = [];
  for (let index = 0; index < data.length; index += 1) {
    const byte = data[index];
    if (byte === 0) output.push(0);
    else if (byte <= 8) {
      for (const next of data.subarray(index + 1, index + 1 + byte)) output.push(next);
      index += byte;
    } else if (byte <= 0x7f) output.push(byte);
    else if (byte <= 0xbf) {
      const pair = (byte << 8) | data[index + 1];
      index += 1;
      const distance = (pair & 0x3fff) >>> 3;
      const length = (pair & 7) + 3;
      for (let copy = 0; copy < length; copy += 1) {
        output.push(output[output.length - distance] ?? 0);
      }
    } else {
      output.push(32, byte ^ 0x80);
    }
  }
  return Uint8Array.from(output);
}

function trailingEntrySize(data: Uint8Array): number {
  let size = 0;
  for (let index = 0; index < 4 && index < data.length; index += 1) {
    const value = data[data.length - 1 - index];
    size |= (value & 0x7f) << (7 * index);
    if (value & 0x80) break;
  }
  return size;
}

function stripTrailing(data: Uint8Array, flags: number): Uint8Array {
  let end = data.length;
  let flag = flags >> 1;
  while (flag) {
    if (flag & 1) {
      const size = trailingEntrySize(data.subarray(0, end));
      end -= size;
      if (end <= 0) return data;
    }
    flag >>= 1;
  }
  if (flags & 1 && end > 0) end -= (data[end - 1] & 3) + 1;
  return end > 0 && end < data.length ? data.subarray(0, end) : data;
}

function u64be(bytes: Uint8Array, pos: number): bigint {
  let value = 0n;
  for (let index = 0; index < 8; index += 1) {
    const byte = pos + index < bytes.length ? bytes[pos + index] : 0;
    value = (value << 8n) | BigInt(byte);
  }
  return value;
}

function decompressHuffCdic(records: Uint8Array[], huffIndex: number, huffCount: number) {
  const huff = records[huffIndex];
  if (!huff || huff.length < 24) throw new Error("无法解开 Kindle 压缩");
  const view = new DataView(huff.buffer, huff.byteOffset, huff.byteLength);
  const off1 = view.getUint32(8, false);
  const off2 = view.getUint32(12, false);
  const dict1: Array<{ len: number; term: boolean; max: number }> = [];
  for (let index = 0; index < 256; index += 1) {
    const raw = view.getUint32(off1 + index * 4, false);
    const len = raw & 0x1f;
    dict1.push({
      len,
      term: Boolean(raw & 0x80),
      max: ((raw >>> 8) + 1 << (32 - len)) - 1,
    });
  }
  const mincode = [0];
  const maxcode = [0];
  for (let len = 1; len <= 32; len += 1) {
    const min = view.getUint32(off2 + (len - 1) * 8, false);
    const max = view.getUint32(off2 + (len - 1) * 8 + 4, false);
    mincode[len] = min << (32 - len);
    maxcode[len] = ((max + 1) << (32 - len)) - 1;
  }
  const dictionary: Array<{ bytes: Uint8Array; ready: boolean } | null> = [];
  for (let offset = 1; offset < huffCount; offset += 1) {
    const cdic = records[huffIndex + offset];
    if (!cdic || cdic.length < 16) continue;
    const cdicView = new DataView(cdic.buffer, cdic.byteOffset, cdic.byteLength);
    const phrases = cdicView.getUint32(8, false);
    const bits = cdicView.getUint32(12, false);
    const take = Math.min(1 << bits, phrases - dictionary.length);
    for (let index = 0; index < take; index += 1) {
      const entry = cdicView.getUint16(16 + index * 2, false);
      const blen = cdicView.getUint16(16 + entry, false);
      const slice = cdic.subarray(18 + entry, 18 + entry + (blen & 0x7fff));
      dictionary.push({ bytes: slice, ready: Boolean(blen & 0x8000) });
    }
  }

  function unpack(data: Uint8Array): Uint8Array {
    const chunks: Uint8Array[] = [];
    let bitsLeft = data.length * 8;
    let pos = 0;
    let n = 32;
    let packed = u64be(data, pos);
    while (true) {
      if (n <= 0) {
        pos += 4;
        packed = u64be(data, pos);
        n += 32;
      }
      const code = Number((packed >> BigInt(n)) & 0xffffffffn);
      let { len, term, max } = dict1[code >>> 24] ?? { len: 0, term: true, max: 0 };
      if (!term) {
        while (code < mincode[len]) len += 1;
        max = maxcode[len];
      }
      n -= len;
      bitsLeft -= len;
      if (bitsLeft < 0) break;
      const slot = (max - code) >>> (32 - len);
      const entry = dictionary[slot];
      if (!entry) break;
      if (!entry.ready) {
        entry.bytes = unpack(entry.bytes);
        entry.ready = true;
      }
      chunks.push(entry.bytes);
    }
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  return unpack;
}

function pdbRecords(bytes: Uint8Array): Uint8Array[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 86) throw new Error("不是有效的 Kindle 电子书");
  const count = u16(view, 76);
  const offsets: number[] = [];
  for (let index = 0; index < count; index += 1) {
    offsets.push(u32(view, 78 + index * 8));
  }
  return offsets.map((start, index) =>
    bytes.subarray(start, index + 1 < offsets.length ? offsets[index + 1] : bytes.length),
  );
}

function looksLikeFlowHtml(html: string) {
  return /<(?:html|body|head|p|div|h[1-6]|mbp:pagebreak|font|span|img|br|a)\b/i.test(html);
}

function sniffImage(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return "image/png";
  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  return null;
}

function decodeText(bytes: Uint8Array, encoding: number): string {
  const label = encoding === 65001 ? "utf-8" : encoding === 936 ? "gb18030" : "windows-1252";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function readExth(record0: Uint8Array, mobiLen: number) {
  const start = 16 + mobiLen;
  if (start + 12 > record0.length) return { title: "", author: "", coverOffset: -1 };
  const magic = String.fromCharCode(...record0.subarray(start, start + 4));
  if (magic !== "EXTH") return { title: "", author: "", coverOffset: -1 };
  const view = new DataView(record0.buffer, record0.byteOffset, record0.byteLength);
  const count = view.getUint32(start + 8, false);
  let offset = start + 12;
  let title = "";
  let author = "";
  let coverOffset = -1;
  const decoder = new TextDecoder("utf-8");
  for (let index = 0; index < count && offset + 8 <= record0.length; index += 1) {
    const type = view.getUint32(offset, false);
    const length = view.getUint32(offset + 4, false);
    const payload = record0.subarray(offset + 8, offset + length);
    if (type === 100) author = author || decoder.decode(payload).trim();
    if (type === 503 || type === 99) title = title || decoder.decode(payload).trim();
    if (type === 201 && payload.length >= 4) {
      coverOffset = new DataView(payload.buffer, payload.byteOffset, payload.byteLength).getUint32(0, false);
    }
    offset += length;
  }
  return { title, author, coverOffset };
}

export function looksLikeMobi(bytes: Uint8Array, name = ""): boolean {
  if (/\.(mobi|azw|azw3|prc)$/i.test(name)) return true;
  if (bytes.length < 68) return false;
  const type = String.fromCharCode(...bytes.subarray(60, 68));
  return type === "BOOKMOBI" || type === "TEXtREAd";
}

export function parseMobi(bytes: Uint8Array, name = ""): ParsedEpub {
  const records = pdbRecords(bytes);
  const record0 = records[0];
  if (!record0 || record0.length < 16) throw new Error("不是有效的 Kindle 电子书");
  const view = new DataView(record0.buffer, record0.byteOffset, record0.byteLength);
  const compression = u16(view, 0);
  const encryption = u16(view, 12);
  if (encryption) throw new Error("这本书有加密，无法导入");
  const textRecords = u16(view, 8);
  const encoding = record0.length >= 32 ? u32(view, 28) : 65001;
  const mobiLen = record0.length >= 24 && String.fromCharCode(...record0.subarray(16, 20)) === "MOBI"
    ? u32(view, 20)
    : 0;
  const extraFlags = mobiLen > 0xf0 && record0.length >= 16 + 0xf4 ? u16(view, 16 + 0xf2) : 0;
  const version = mobiLen > 36 && record0.length >= 16 + 40 ? u32(view, 16 + 36) : 0;
  const firstImage = mobiLen > 108 && record0.length >= 16 + 112 ? u32(view, 16 + 108) : 0;
  const huffStart = mobiLen > 116 && record0.length >= 16 + 120 ? u32(view, 16 + 112) : 0;
  const huffCount = mobiLen > 116 && record0.length >= 16 + 120 ? u32(view, 16 + 116) : 0;
  const fullNameOffset = mobiLen > 68 && record0.length >= 16 + 72 ? u32(view, 16 + 64) : 0;
  const fullNameLength = mobiLen > 68 && record0.length >= 16 + 72 ? u32(view, 16 + 68) : 0;
  const exthFlags = mobiLen > 128 && record0.length >= 16 + 132 ? u32(view, 16 + 128) : 0;
  const exth = exthFlags & 0x40 ? readExth(record0, mobiLen) : { title: "", author: "", coverOffset: -1 };
  const pdbName = new TextDecoder("latin1")
    .decode(bytes.subarray(0, 32))
    .replace(/\0.*$/, "")
    .trim();
  const headerTitle =
    fullNameLength > 0 && fullNameOffset + fullNameLength <= record0.length
      ? decodeText(record0.subarray(fullNameOffset, fullNameOffset + fullNameLength), encoding).trim()
      : "";
  const title =
    exth.title || headerTitle || titleFromFilename(name) || pdbName || "未命名电子书";

  let unpack: (data: Uint8Array) => Uint8Array;
  if (compression === 1) unpack = (data) => data;
  else if (compression === 2) unpack = decompressPalmDoc;
  else if (compression === 17480) unpack = decompressHuffCdic(records, huffStart, huffCount);
  else throw new Error("无法解开这本 Kindle 书的压缩");

  const chunks: Uint8Array[] = [];
  for (let index = 1; index <= textRecords && index < records.length; index += 1) {
    const stripped = stripTrailing(records[index], extraFlags);
    chunks.push(unpack(stripped));
  }
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  let html = decodeText(merged, encoding)
    .replace(/\0/g, "")
    .replace(/<idx:entry[\s\S]*?<\/idx:entry>/gi, "")
    .replace(/<guide[\s\S]*?<\/guide>/gi, "");
  html = html.replace(
    /<img([^>]*?)recindex=["']0*([0-9]+)["']([^>]*)>/gi,
    (_, before: string, rec: string, after: string) =>
      `<img${before}src="mobi-image-${Number(rec)}"${after}>`,
  );
  if (!html.replace(/<[^>]+>/g, "").trim() || (version >= 8 && !looksLikeFlowHtml(html))) {
    throw new Error("无法解析这本 Kindle 书，可先转成 EPUB 再导入");
  }
  const chapters = splitHtmlChapters(html, title);
  if (!chapters.length) throw new Error("这本电子书没有可阅读的章节");

  const images: ParsedEpub["images"] = [];
  if (firstImage > 0) {
    for (let index = firstImage; index < records.length; index += 1) {
      const mime = sniffImage(records[index]);
      if (!mime) continue;
      const rec = index - firstImage + 1;
      images.push({
        href: `mobi-image-${rec}`,
        mime,
        bytes: records[index],
      });
    }
  }
  let cover: ParsedEpub["cover"];
  if (exth.coverOffset >= 0 && firstImage > 0) {
    const rec = firstImage + exth.coverOffset;
    const found = images.find((image) => image.href === `mobi-image-${exth.coverOffset + 1}`);
    if (found) cover = { href: found.href, mime: found.mime, bytes: found.bytes };
    else if (records[rec]) {
      const mime = sniffImage(records[rec]);
      if (mime) {
        cover = { href: `mobi-image-${exth.coverOffset + 1}`, mime, bytes: records[rec] };
        images.unshift(cover);
      }
    }
  }
  return {
    title,
    author: exth.author || undefined,
    cover,
    chapters,
    images,
  };
}
