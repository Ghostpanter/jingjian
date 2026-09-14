import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ancestorFolders,
  buildFileTree,
  collectFolders,
  isImportableNoteName,
  normalizeFolder,
  relativeDir,
} from "./folder-tree.ts";
import type { Note } from "./types.ts";

function note(id: string, folder?: string): Note {
  return {
    id,
    content: `# ${id}\n`,
    createdAt: 1,
    updatedAt: 2,
    ...(folder ? { folder } : {}),
  };
}

test("normalizeFolder drops dots and slashes", () => {
  assert.equal(normalizeFolder(" 日记 / 2026 / "), "日记/2026");
  assert.equal(normalizeFolder("../秘密"), "秘密");
  assert.equal(relativeDir("手册/速查.md"), "手册");
  assert.equal(relativeDir("速查.md"), "");
  assert.deepEqual(ancestorFolders("手册/写作"), ["手册", "手册/写作"]);
});

test("collectFolders includes parents and extra empty folders", () => {
  const folders = collectFolders([note("a", "手册/写作")], ["草稿"]);
  assert.deepEqual(new Set(folders), new Set(["手册", "手册/写作", "草稿"]));
});

test("buildFileTree nests notes under folders", () => {
  const tree = buildFileTree(
    [note("root"), note("guide", "手册"), note("book")],
    ["手册"],
  );
  const book = { ...note("book"), bookId: "b1", bookTitle: "书" };
  const withBook = buildFileTree([note("root"), note("guide", "手册"), book], ["手册"]);
  assert.equal(withBook.filter((node) => node.kind === "note").length, 1);
  const folder = tree.find((node) => node.kind === "folder");
  assert.equal(folder?.kind, "folder");
  if (folder?.kind !== "folder") return;
  assert.equal(folder.name, "手册");
  assert.equal(folder.children.length, 1);
  assert.equal(folder.children[0].kind, "note");
});

test("empty extra folders still appear", () => {
  const tree = buildFileTree([], ["草稿"]);
  assert.equal(tree.length, 1);
  assert.equal(tree[0].kind, "folder");
  if (tree[0].kind !== "folder") return;
  assert.equal(tree[0].name, "草稿");
  assert.equal(tree[0].children.length, 0);
});

test("importable names skip hidden and non-notes", () => {
  assert.equal(isImportableNoteName("手册/a.md"), true);
  assert.equal(isImportableNoteName(".DS_Store"), false);
  assert.equal(isImportableNoteName("photo.png"), false);
});
