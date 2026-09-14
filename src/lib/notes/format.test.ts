import assert from "node:assert/strict";
import { test } from "node:test";
import {
  countChars,
  firstLineTitle,
  formatCharCount,
  isBlankContent,
  isLargeNote,
  LARGE_NOTE_CHARS,
  matchesQuery,
  previewWindow,
  snippetFromContent,
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
