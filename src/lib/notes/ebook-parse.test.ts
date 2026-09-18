import assert from "node:assert/strict";
import { test } from "node:test";
import { buildEpub } from "./epub.ts";
import {
  decodeEbookBytes,
  parseEbook,
  parseFb2,
  parseHtmlEbook,
  parseTxtEbook,
  splitPlainChapters,
} from "./ebook-parse.ts";
import { decompressPalmDoc, parseMobi } from "./ebook-mobi.ts";
import { classifyIncoming } from "./open-incoming.ts";

test("txt novels split on chinese chapter headings", () => {
  const parsed = parseTxtEbook(
    "作者：某人\n\n第一章 风起\n天刚亮。\n\n第二章 雨至\n夜里下了雨。\n",
    "试读",
  );
  assert.equal(parsed?.chapters.length, 3);
  assert.equal(parsed?.chapters[1]?.title, "第一章 风起");
  assert.match(parsed?.chapters[2]?.content || "", /夜里下了雨/);
});

test("plain txt without chapters is not a book", () => {
  assert.equal(parseTxtEbook("一段随手记下的话。", "草稿"), null);
  assert.equal(splitPlainChapters("只有一段。", "草稿").length, 1);
});

test("html book splits on h1", () => {
  const parsed = parseHtmlEbook(
    new TextEncoder().encode(
      "<html><title>廊下</title><body><h1>一</h1><p>晨光。</p><h1>二</h1><p>暮色。</p></body></html>",
    ),
    "book.html",
  );
  assert.equal(parsed.title, "廊下");
  assert.equal(parsed.chapters.length, 2);
  assert.match(parsed.chapters[0].content, /晨光/);
});

test("fb2 sections become chapters", async () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook>
  <description><title-info>
    <book-title>廊下三章</book-title>
    <author><first-name>静</first-name><last-name>笺</last-name></author>
  </title-info></description>
  <body>
    <section><title><p>一 廊下</p></title><p>纸灯。</p></section>
    <section><title><p>二 灯下</p></title><p>磨墨。</p></section>
  </body>
</FictionBook>`;
  const parsed = await parseFb2(new TextEncoder().encode(xml));
  assert.equal(parsed.title, "廊下三章");
  assert.equal(parsed.author, "静 笺");
  assert.equal(parsed.chapters.length, 2);
  assert.match(parsed.chapters[0].content, /纸灯/);
});

test("fb2 nested sections are not double-counted", async () => {
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<FictionBook>
  <description><title-info><book-title>上卷</book-title></title-info></description>
  <body>
    <section>
      <title><p>上卷</p></title>
      <section><title><p>一</p></title><p>甲。</p></section>
      <section><title><p>二</p></title><p>乙。</p></section>
    </section>
  </body>
</FictionBook>`;
  const parsed = await parseFb2(new TextEncoder().encode(xml));
  assert.equal(parsed.chapters.length, 2);
  assert.equal(parsed.chapters[0]?.title, "一");
  assert.match(parsed.chapters[1]?.content || "", /乙/);
});

test("palmdoc decompresses literals and space-pairs", () => {
  const raw = Uint8Array.from([0x48, 0x69, 0xc1]);
  const text = new TextDecoder().decode(decompressPalmDoc(raw));
  assert.equal(text, "Hi A");
});

function be16(value: number) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value);
  return bytes;
}
function be32(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value);
  return bytes;
}
function joinBytes(...parts: Uint8Array[]) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

test("uncompressed mobi html becomes chapters", () => {
  const html = "<html><body><h1>一</h1><p>晨光。</p><h1>二</h1><p>暮色。</p></body></html>";
  const text = new TextEncoder().encode(html);
  const palmdoc = joinBytes(be16(1), be16(0), be32(text.length), be16(1), be16(4096), be16(0), be16(0));
  const mobi = new Uint8Array(232);
  mobi.set(new TextEncoder().encode("MOBI"));
  new DataView(mobi.buffer).setUint32(4, 232);
  new DataView(mobi.buffer).setUint32(12, 65001);
  const rec0 = joinBytes(palmdoc, mobi);
  const rec1 = text;
  const pdb = new Uint8Array(78);
  pdb.set(new TextEncoder().encode("Test Book"));
  pdb.set(new TextEncoder().encode("BOOK"), 60);
  pdb.set(new TextEncoder().encode("MOBI"), 64);
  new DataView(pdb.buffer).setUint16(76, 2);
  const list = new Uint8Array(16);
  const dataStart = 78 + 16;
  new DataView(list.buffer).setUint32(0, dataStart);
  new DataView(list.buffer).setUint32(8, dataStart + rec0.length);
  const bytes = joinBytes(pdb, list, rec0, rec1);
  const parsed = parseMobi(bytes, "test.mobi");
  assert.equal(parsed.chapters.length, 2);
  assert.match(parsed.chapters[1].content, /暮色/);
});

test("kf8 without flow html asks to convert to epub", () => {
  const text = new TextEncoder().encode("KINDLE8\0binary");
  const palmdoc = joinBytes(be16(1), be16(0), be32(text.length), be16(1), be16(4096), be16(0), be16(0));
  const mobi = new Uint8Array(232);
  mobi.set(new TextEncoder().encode("MOBI"));
  new DataView(mobi.buffer).setUint32(4, 232);
  new DataView(mobi.buffer).setUint32(12, 65001);
  new DataView(mobi.buffer).setUint32(36, 8);
  const rec0 = joinBytes(palmdoc, mobi);
  const pdb = new Uint8Array(78);
  pdb.set(new TextEncoder().encode("KF8 Book"));
  pdb.set(new TextEncoder().encode("BOOK"), 60);
  pdb.set(new TextEncoder().encode("MOBI"), 64);
  new DataView(pdb.buffer).setUint16(76, 2);
  const list = new Uint8Array(16);
  const dataStart = 78 + 16;
  new DataView(list.buffer).setUint32(0, dataStart);
  new DataView(list.buffer).setUint32(8, dataStart + rec0.length);
  const bytes = joinBytes(pdb, list, rec0, text);
  assert.throws(() => parseMobi(bytes, "book.azw3"), /转成 EPUB/);
});

test("parseEbook still reads epub", async () => {
  const bytes = await buildEpub({
    title: "试读",
    chapters: [
      { title: "一", content: "# 一\n\n晨光。" },
      { title: "二", content: "# 二\n\n暮色。" },
    ],
  });
  const parsed = await parseEbook(bytes, "试读.epub");
  assert.equal(parsed.title, "试读");
  assert.equal(parsed.chapters.length, 2);
});

test("decode prefers gbk when utf-8 is mojibake", () => {
  let supported = true;
  try {
    new TextDecoder("gb18030");
  } catch {
    supported = false;
  }
  if (!supported) return;
  const gbkHello = Uint8Array.from([0xc4, 0xe3, 0xba, 0xc3]);
  const text = decodeEbookBytes(gbkHello);
  assert.match(text, /你|好/);
});

test("classifies kindle and fb2 as ebooks", () => {
  assert.equal(classifyIncoming("book.epub"), "ebook");
  assert.equal(classifyIncoming("novel.mobi"), "ebook");
  assert.equal(classifyIncoming("kindle.azw3"), "ebook");
  assert.equal(classifyIncoming("story.fb2"), "ebook");
  assert.equal(classifyIncoming("page.html"), "ebook");
  assert.equal(classifyIncoming("notes.txt"), "txt");
});
