import assert from "node:assert/strict";
import { test } from "node:test";
import {
  PRINT_CHAPTER_CHARS,
  PRINT_SYSTEM_INTRO,
  PRINT_TOTAL_CHARS,
  buildPrintDocument,
  printJobTitle,
  selectPrintNotes,
  windowPrintNotes,
  type PrintNote,
} from "./print-doc.ts";

const book: PrintNote[] = [
  {
    id: "c",
    bookId: "bk",
    bookTitle: "廊下三章",
    chapterIndex: 2,
    content: "# 三 合卷\n\n末章",
  },
  {
    id: "a",
    bookId: "bk",
    bookTitle: "廊下三章",
    chapterIndex: 0,
    content: "# 一 廊下\n\n开篇",
  },
  {
    id: "b",
    bookId: "bk",
    bookTitle: "廊下三章",
    chapterIndex: 1,
    content: "# 二 灯下\n\n中篇",
  },
  { id: "note", content: "# 手册\n\n不是这本书" },
];

test("print intro tells people to use the system printer", () => {
  assert.match(PRINT_SYSTEM_INTRO, /不单独直连/);
  assert.match(PRINT_SYSTEM_INTRO, /电脑/);
  assert.match(PRINT_SYSTEM_INTRO, /安卓/);
  assert.match(PRINT_SYSTEM_INTRO, /网页/);
  assert.match(PRINT_SYSTEM_INTRO, /先看纸面排版/);
});

test("book print follows chapter order and a single chapter stays one note", () => {
  const whole = selectPrintNotes(book, "b", "book");
  assert.deepEqual(
    whole.map((note) => note.id),
    ["a", "b", "c"],
  );
  assert.equal(printJobTitle(whole), "廊下三章");
  const one = selectPrintNotes(book, "b", "chapter");
  assert.deepEqual(
    one.map((note) => note.id),
    ["b"],
  );
  assert.equal(printJobTitle(one), "廊下三章 · 二 灯下");
  assert.deepEqual(
    selectPrintNotes(book, "note", "book").map((note) => note.id),
    ["note"],
  );
});

test("print html escapes titles, keeps txt literal, and breaks chapters", () => {
  const html = buildPrintDocument({
    title: "窗边</title><script>",
    sections: [
      {
        heading: "一",
        content: "# 别的标题\n\n正文",
        format: "md",
        truncated: false,
      },
      {
        heading: "原文",
        content: "<b>不是标签</b>",
        format: "txt",
        truncated: true,
      },
    ],
  });
  const lt = "\u0026lt;";
  const gt = "\u0026gt;";
  assert.ok(html.includes(`<title>窗边${lt}/title${gt}${lt}script${gt}</title>`));
  assert.match(html, /print-book-title/);
  assert.match(html, /<h1[^>]*>别的标题<\/h1>/);
  assert.ok(html.includes(`<pre class="plain-text">${lt}b${gt}不是标签${lt}/b${gt}</pre>`));
  assert.match(html, /纸面只排了开头/);
  assert.match(html, /break-before:\s*page/);
  assert.equal(html.split('class="print-chapter"').length - 1, 2);
  assert.doesNotMatch(html, /<script>/);
});

test("long notes and later chapters are clipped instead of laid out whole", () => {
  const long = "甲".repeat(PRINT_CHAPTER_CHARS + 20);
  const windowed = windowPrintNotes([
    { id: "1", content: long, format: "txt" },
  ]);
  assert.equal(windowed.truncated, true);
  assert.equal(windowed.sections[0]?.content.length, PRINT_CHAPTER_CHARS);
  const chapter = "乙".repeat(40_000);
  const bookNotes: PrintNote[] = [0, 1, 2, 3].map((chapterIndex) => ({
    id: String(chapterIndex),
    bookId: "long",
    bookTitle: "长书",
    chapterIndex,
    format: "txt" as const,
    content: chapter,
  }));
  const cut = windowPrintNotes(bookNotes);
  assert.equal(cut.sections.length, 3);
  assert.equal(cut.omittedChapters, 1);
  assert.ok(cut.sections.reduce((sum, section) => sum + section.content.length, 0) <= PRINT_TOTAL_CHARS);
  const html = buildPrintDocument({
    title: "长书",
    sections: cut.sections,
    omittedChapters: cut.omittedChapters,
  });
  assert.match(html, /还有 1 章没有排进这次预览/);
});
