import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareNotes,
  countChars,
  editorSlice,
  editorSliceAround,
  extendBounds,
  findQueryHit,
  firstLineTitle,
  formatCharCount,
  isBlankContent,
  isLargeNote,
  LARGE_NOTE_CHARS,
  matchesQuery,
  noteAliases,
  previewWindow,
  snippetFromContent,
  groupNotes,
  parseOpenIds,
  toggleOpenId,
  titleFromContent,
} from "./format.ts";

test("title and snippet only need the first non-empty lines", () => {
  const content = "# 窗边的风\n\n下午的光线落在桌上。\n";
  assert.equal(titleFromContent(content), "窗边的风");
  assert.equal(firstLineTitle(content), "窗边的风");
  assert.match(snippetFromContent(content), /下午的光线/);
  assert.equal(countChars("一 二\n三"), 3);
  assert.equal(isBlankContent(""), true);
  assert.equal(isBlankContent("  \n"), true);
});

test("large notes never split or copy the full body", () => {
  const huge = "# 长卷\n\n开头摘要。\n" + "a".repeat(9_000_000);
  assert.equal(huge.length > LARGE_NOTE_CHARS, true);
  assert.equal(isLargeNote(huge), true);
  const started = Date.now();
  assert.equal(titleFromContent(huge), "长卷");
  assert.equal(firstLineTitle(huge), "长卷");
  assert.match(snippetFromContent(huge), /开头摘要/);
  assert.equal(countChars(huge), huge.length);
  assert.match(formatCharCount(huge), /^约 /);
  assert.equal(isBlankContent(huge), false);
  const window = previewWindow(huge, 100);
  assert.equal(window.truncated, true);
  assert.equal(window.text.length, 100);
  assert.equal(
    matchesQuery(
      { id: "1", content: huge, createdAt: 1, updatedAt: 1 },
      "长卷",
    ),
    true,
  );
  const deep = `${"开".repeat(300_000)}句末记号zz`;
  assert.equal(
    matchesQuery({ id: "1", content: deep, createdAt: 1, updatedAt: 1 }, "句末记号zz"),
    true,
  );
  assert.equal(
    matchesQuery(
      { id: "1", content: "短", createdAt: 1, updatedAt: 1 },
      "不可能出现的检索词xyz",
    ),
    false,
  );
  assert.ok(Date.now() - started < 500, "large-note helpers must stay cheap");
});

test("yaml front matter supplies the title and is skipped in snippets", () => {
  const content = '---\ntitle: "窗边的风"\ndate: 2026-09-15\n---\n\n# 窗边的风\n\n下午的光线落在桌上。\n';
  assert.equal(firstLineTitle(content), "窗边的风");
  assert.equal(titleFromContent(content), "窗边的风");
  assert.match(snippetFromContent(content), /下午的光线/);
  assert.doesNotMatch(snippetFromContent(content), /date:/);
  assert.equal(firstLineTitle("---\ntitle: 廊下\n---\n\n正文\n"), "廊下");
});

test("search matches folder path", () => {
  assert.equal(
    matchesQuery(
      { id: "1", content: "正文", createdAt: 1, updatedAt: 1, folder: "手册/写作" },
      "手册",
    ),
    true,
  );
});

test("compareNotes sorts by updated, created, or title", () => {
  const a = { id: "a", content: "# 窗边", createdAt: 10, updatedAt: 20 };
  const b = { id: "b", content: "# 廊下", createdAt: 30, updatedAt: 15 };
  assert.ok(compareNotes(a, b, "updated") < 0);
  assert.ok(compareNotes(a, b, "created") > 0);
  assert.notEqual(compareNotes(a, b, "title"), 0);
  assert.equal(compareNotes(a, b, "title"), -compareNotes(b, a, "title"));
  assert.ok(compareNotes(a, b, "opened", { a: 1, b: 5 }) > 0);
});

test("search matches aliases, book titles, and a window around an offset", () => {
  assert.equal(
    matchesQuery(
      {
        id: "1",
        content: "---\naliases:\n  - 窗边\n---\n# 标题\n",
        createdAt: 1,
        updatedAt: 1,
      },
      "窗边",
    ),
    true,
  );
  assert.equal(
    matchesQuery(
      { id: "1", content: "# 一", createdAt: 1, updatedAt: 1, bookTitle: "廊下三章" },
      "廊下",
    ),
    true,
  );
  const body = `${"甲".repeat(20)}\n${"乙".repeat(80)}`;
  const slice = editorSliceAround(body, 70, 30);
  assert.ok(slice.start <= 70 && slice.end >= 70);
  const jumped = previewWindow(body, 40, 70);
  assert.ok(jumped.start > 0);
  assert.ok(jumped.text.length > 0);
});

test("aliases and editor slices stay on line boundaries", () => {
  const content = "---\naliases:\n  - 窗边\n---\n# 标题\n";
  assert.deepEqual(noteAliases(content), ["窗边"]);
  const text = "甲乙丙丁\n戊己庚辛";
  const slice = editorSlice(text, 0, 4);
  assert.equal(slice.start, 0);
  assert.equal(text[slice.end] === "\n" || slice.end === text.length, true);
});

test("books group by bookId and stay collapsed until opened", () => {
  const chapters = [
    {
      id: "c1",
      content: "# 一",
      createdAt: 1,
      updatedAt: 1,
      bookId: "b1",
      bookTitle: "廊下三章",
      chapterIndex: 0,
    },
    {
      id: "c2",
      content: "# 二",
      createdAt: 1,
      updatedAt: 2,
      bookId: "b1",
      bookTitle: "廊下三章",
      chapterIndex: 1,
    },
    { id: "n1", content: "# 窗边", createdAt: 3, updatedAt: 3 },
  ];
  const groups = groupNotes(chapters);
  assert.equal(groups[0]?.book, true);
  assert.equal(groups[0]?.bookId, "b1");
  assert.equal(groups[0]?.label, "廊下三章");
  assert.deepEqual(groups[0]?.notes.map((note) => note.id), ["c1", "c2"]);
  assert.equal(parseOpenIds(null).size, 0);
  assert.deepEqual([...parseOpenIds(["b1", "", 2])], ["b1"]);
  const opened = toggleOpenId([], "b1");
  assert.equal(opened.has("b1"), true);
  assert.equal(toggleOpenId(opened, "b1").has("b1"), false);
});

test("aliases after a long yaml block still resolve", () => {
  const content = `---\n${"x".repeat(4800)}\naliases:\n  - 很后面的别名\n---\n# 标题\n`;
  assert.deepEqual(noteAliases(content), ["很后面的别名"]);
  assert.equal(firstLineTitle(content), "标题");
});

test("findQueryHit returns the line around a late match", () => {
  const content = `${"开".repeat(40_000)}\n后半句有记号zz在这里\n`;
  const hit = findQueryHit(content, "记号zz");
  assert.ok(hit);
  assert.ok((hit?.offset ?? 0) > 40_000);
  assert.match(hit?.line ?? "", /记号zz/);
});

test("extendBounds grows and then slides inside the cap", () => {
  const grown = extendBounds(100_000, { start: 0, end: 48_000 }, 1, 16_000, 240_000);
  assert.deepEqual(grown, { start: 0, end: 64_000 });
  const slid = extendBounds(400_000, { start: 0, end: 240_000 }, 1, 16_000, 240_000);
  assert.equal(slid?.end, 256_000);
  assert.equal((slid?.end ?? 0) - (slid?.start ?? 0), 240_000);
  assert.equal(extendBounds(20, { start: 0, end: 20 }, 1), null);
});
