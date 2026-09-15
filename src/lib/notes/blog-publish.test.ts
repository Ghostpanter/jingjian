import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFrontMatter,
  buildPostFile,
  choosePostPath,
  defaultPostPath,
  encodeContentPath,
  folderCategory,
  githubParts,
  joinRepoPath,
  postSlug,
  stripMatchingHeading,
} from "./blog-publish.ts";
import { postsDirFor } from "./blog-config.ts";
import type { Note } from "./types.ts";

test("githubParts accepts owner/repo and github urls", () => {
  assert.deepEqual(githubParts("Ghostpanter/blog"), { owner: "Ghostpanter", name: "blog" });
  assert.deepEqual(githubParts("https://github.com/Ghostpanter/blog.git"), {
    owner: "Ghostpanter",
    name: "blog",
  });
  assert.deepEqual(githubParts("https://github.com/Ghostpanter/blog/"), {
    owner: "Ghostpanter",
    name: "blog",
  });
  assert.throws(() => githubParts("only-owner"), /owner\/repo/);
});

test("postSlug keeps chinese and kebab-cases ascii", () => {
  assert.equal(postSlug("Hello World"), "hello-world");
  assert.equal(postSlug("数据库速查文档"), "数据库速查文档");
  assert.equal(postSlug("  --  --  "), "post");
});

test("defaultPostPath uses date and posts dir", () => {
  const now = new Date("2026-09-15T03:00:00Z");
  const path = defaultPostPath("Hello World", "content/posts", now);
  assert.match(path, /^content\/posts\/\d{4}-\d{2}-\d{2}-hello-world\.md$/);
});

test("joinRepoPath strips slashes", () => {
  assert.equal(joinRepoPath("/content/posts/", "/a.md"), "content/posts/a.md");
});

test("stripMatchingHeading removes the title h1 only", () => {
  assert.equal(stripMatchingHeading("# 标题\n\n正文", "标题"), "正文");
  assert.equal(stripMatchingHeading("正文第一行", "标题"), "正文第一行");
});

test("folderCategory uses the leaf folder", () => {
  assert.equal(folderCategory("手册/写作"), "写作");
  assert.equal(folderCategory(""), null);
  assert.equal(folderCategory(undefined), null);
});

test("hugo and hexo front matter", () => {
  const now = new Date("2026-09-15T03:04:05+08:00");
  const hugo = buildFrontMatter("hugo", '说"你好"', "写作", now);
  assert.match(hugo, /^---\n/);
  assert.match(hugo, /title: "说\\"你好\\""/);
  assert.match(hugo, /draft: false/);
  assert.match(hugo, /categories: \["写作"\]/);
  const hexo = buildFrontMatter("hexo", "标题", "随笔", now);
  assert.match(hexo, /date: \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  assert.match(hexo, /categories:\n  - "随笔"/);
  assert.doesNotMatch(hexo, /draft:/);
});

test("buildPostFile wraps the note body", () => {
  const note: Note = {
    id: "n1",
    content: "# 标题\n\n一段话。\n",
    createdAt: 1,
    updatedAt: 1,
    folder: "手册/写作",
  };
  const file = buildPostFile(note, "hugo", new Date("2026-09-15T03:00:00+08:00"));
  assert.match(file, /title: "标题"/);
  assert.match(file, /categories: \["写作"\]/);
  assert.match(file, /一段话。/);
  assert.doesNotMatch(file, /^# 标题/m);
});

test("postsDirFor switches defaults with the engine", () => {
  assert.equal(postsDirFor("hugo"), "content/posts");
  assert.equal(postsDirFor("hexo"), "source/_posts");
  assert.equal(postsDirFor("hugo", "source/_posts"), "content/posts");
  assert.equal(postsDirFor("hexo", "content/custom"), "content/custom");
});

test("choosePostPath keeps the remembered file and avoids collisions", () => {
  const now = new Date(2026, 8, 15, 3, 0, 0);
  assert.deepEqual(
    choosePostPath({
      title: "Hello",
      postsDir: "content/posts",
      noteId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      remembered: null,
      remoteExists: false,
      now,
    }),
    { path: "content/posts/2026-09-15-hello.md", useSha: false },
  );
  assert.deepEqual(
    choosePostPath({
      title: "Hello",
      postsDir: "content/posts",
      noteId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      remembered: null,
      remoteExists: true,
      now,
    }),
    { path: "content/posts/2026-09-15-hello-aaaaaaaa.md", useSha: false },
  );
  assert.deepEqual(
    choosePostPath({
      title: "Hello",
      postsDir: "content/posts",
      noteId: "id",
      remembered: "content/posts/old.md",
      remoteExists: true,
      now,
    }),
    { path: "content/posts/old.md", useSha: true },
  );
});

test("encodeContentPath encodes each segment", () => {
  assert.equal(
    encodeContentPath("content/posts/数据库.md"),
    "content/posts/%E6%95%B0%E6%8D%AE%E5%BA%93.md",
  );
});
