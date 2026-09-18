import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compareNotes,
  countChars,
  firstLineTitle,
  formatCharCount,
  isBlankContent,
  isLargeNote,
  LARGE_NOTE_CHARS,
  matchesQuery,
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
  assert.equal(
    matchesQuery(
      { id: "1", content: huge, createdAt: 1, updatedAt: 1 },
      "不可能出现的检索词xyz"),
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
