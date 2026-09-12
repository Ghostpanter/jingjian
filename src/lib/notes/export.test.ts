import assert from "node:assert/strict";
import { test } from "node:test";
import { markdownToDocx, markdownToHtmlDocument, markdownToOdt, markdownToRtf } from "./export-formats.ts";
import { jpegPagesToPdf, choosePageCut } from "./export-pdf.ts";
import { cssUsesUnsupportedColor, exportArticleCss, stripUnsupportedColors } from "./export-render.ts";
import { buildEpub, parseEpub } from "./epub.ts";
import { filenameForNote, parseNoteFile, serializeNote } from "./markdown-file.ts";
import { sanitizeHref } from "./markdown.ts";
import { DEFAULT_THEME, paletteFor } from "./theme.ts";

test("html export includes title and optional styles", () => {
  const styled = new TextDecoder().decode(
    markdownToHtmlDocument("# 窗边\n\n一段话。", {
      title: "窗边",
      styled: true,
      cssVars: "--color-bg: #fff;",
    }),
  );
  assert.match(styled, /<title>窗边<\/title>/);
  assert.match(styled, /md-body/);
  const plain = new TextDecoder().decode(
    markdownToHtmlDocument("# 窗边", { title: "窗边", styled: false }),
  );
  assert.doesNotMatch(plain, /md-body/);
});

test("rtf keeps chinese via unicode escapes", () => {
  const rtf = new TextDecoder().decode(markdownToRtf("# 静笺\n\n正文"));
  assert.match(rtf, /\\rtf1/);
  assert.match(rtf, /\\u/);
});

test("pdf writer emits a header and xref", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const pdf = jpegPagesToPdf([{ jpeg, width: 10, height: 10 }]);
  const text = new TextDecoder("latin1").decode(pdf);
  assert.equal(text.slice(0, 8), "%PDF-1.4");
  assert.match(text, /startxref/);
  assert.match(text, /%%EOF/);
});

test("epub roundtrip restores chapters", async () => {
  const bytes = await buildEpub({
    title: "试读",
    chapters: [
      { title: "一", content: "# 一\n\n晨光。" },
      { title: "二", content: "# 二\n\n暮色。" },
    ],
  });
  const parsed = await parseEpub(bytes);
  assert.equal(parsed.title, "试读");
  assert.equal(parsed.chapters.length, 2);
  assert.match(parsed.chapters[0].content, /晨光/);
});

test("docx and odt are zip packages", async () => {
  const docx = await markdownToDocx("# 静笺\n\n正文");
  const odt = await markdownToOdt("# 静笺\n\n正文");
  assert.equal(String.fromCharCode(docx[0], docx[1]), "PK");
  assert.equal(String.fromCharCode(odt[0], odt[1]), "PK");
});

test("allows relative images and jpeg data urls", () => {
  assert.equal(sanitizeHref("images/a.jpg"), "images/a.jpg");
  assert.equal(sanitizeHref("./images/a.jpg"), "./images/a.jpg");
  assert.ok(sanitizeHref("data:image/jpeg;base64,AAAA"));
  assert.equal(sanitizeHref("data:text/html;base64,AAAA"), null);
  assert.equal(sanitizeHref("javascript:alert(1)"), null);
});

test("pdf capture css uses only hex colors", () => {
  const css = exportArticleCss(paletteFor(DEFAULT_THEME));
  assert.equal(cssUsesUnsupportedColor(css), false);
  assert.match(css, /#/);
  assert.ok(!/oklab|color-mix/i.test(css));
});

test("strips oklab color functions from cloned css", () => {
  const css = "color: oklab(0.5 0.1 -0.1); background: color-mix(in oklab, red 50%, blue);";
  const safe = stripUnsupportedColors(css, "#111111");
  assert.equal(cssUsesUnsupportedColor(safe), false);
  assert.ok(!/oklab|color-mix/i.test(safe));
  assert.match(safe, /#111111/);
});

test("pdf capture css wraps fenced code instead of clipping", () => {
  const css = exportArticleCss(paletteFor(DEFAULT_THEME));
  assert.match(css, /pre \{[\s\S]*white-space:\s*pre-wrap/);
  assert.match(css, /pre \{[\s\S]*break-word/);
  assert.doesNotMatch(css, /overflow-x:\s*auto/);
});

test("pdf capture css keeps inline code as a single box", () => {
  const css = exportArticleCss(paletteFor(DEFAULT_THEME));
  const article = css.match(/article \{[\s\S]*?\n\}/)?.[0] ?? "";
  const code = css.match(/\ncode \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.match(article, /overflow-wrap:\s*break-word/);
  assert.doesNotMatch(article, /anywhere/);
  assert.match(code, /white-space:\s*nowrap/);
  assert.match(code, /inline-block/);
  assert.doesNotMatch(code, /anywhere/);
});

test("pdf capture css keeps mermaid as a figure", () => {
  const css = exportArticleCss(paletteFor(DEFAULT_THEME));
  assert.match(css, /\.mermaid-block/);
  assert.match(css, /\.mermaid-svg/);
  assert.match(css, /pre\.mermaid/);
  assert.match(css, /object-fit:\s*contain/);
  assert.match(css, /article\.fit-figures/);
  assert.match(css, /width:\s*fit-content/);
});

test("txt notes keep format through serialize and filename", () => {
  const note = {
    id: "11111111-2222-4333-a444-555555555555",
    content: "私有网络\ncmdb-standalone",
    createdAt: 1,
    updatedAt: 2,
    format: "txt" as const,
  };
  const raw = serializeNote(note);
  assert.match(raw, /format: txt/);
  const parsed = parseNoteFile(raw, "fallback");
  assert.equal(parsed.format, "txt");
  assert.equal(parsed.content, note.content);
  assert.match(filenameForNote(note), /\.txt$/);
});

test("pdf page cut prefers a block end near the page bottom", () => {
  assert.equal(
    choosePageCut({
      top: 0,
      pageHeight: 1000,
      contentHeight: 4000,
      breaks: [200, 640, 910, 1500],
      keeps: [],
    }),
    910,
  );
});

test("pdf page cut moves an unsplittable block onto the next page", () => {
  assert.equal(
    choosePageCut({
      top: 0,
      pageHeight: 1000,
      contentHeight: 4000,
      breaks: [500],
      keeps: [{ start: 800, end: 1500 }],
    }),
    800,
  );
});

test("pdf page cut does not leave the page almost empty", () => {
  assert.equal(
    choosePageCut({
      top: 0,
      pageHeight: 1000,
      contentHeight: 4000,
      breaks: [100, 200],
      keeps: [{ start: 200, end: 1800 }],
    }),
    1000,
  );
});

test("pdf page cut keeps an atomic figure on one page", () => {
  assert.equal(
    choosePageCut({
      top: 0,
      pageHeight: 1000,
      contentHeight: 4000,
      breaks: [100],
      keeps: [{ start: 400, end: 1100, atomic: true }],
    }),
    400,
  );
});

test("pdf page cut still splits an atomic figure taller than the page", () => {
  assert.equal(
    choosePageCut({
      top: 0,
      pageHeight: 1000,
      contentHeight: 4000,
      breaks: [100, 200],
      keeps: [{ start: 200, end: 1800, atomic: true }],
    }),
    1000,
  );
});
