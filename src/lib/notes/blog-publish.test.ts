import assert from "node:assert/strict";
import test from "node:test";
import {
  buildFrontMatter,
  buildPostFile,
  blogNoteId,
  choosePostPath,
  collectDirectPosts,
  decodeGitContent,
  defaultPostPath,
  encodeContentPath,
  folderCategory,
  githubParts,
  isPostFilename,
  joinRepoPath,
  localIdForBlogPost,
  normalizeRepoEntries,
  postSlug,
  stripMatchingHeading,
  titleFromPostContent,
  titleFromPostName,
} from "./blog-publish.ts";
import { postsDirFor } from "./blog-config.ts";
import type { Note } from "./types.ts";

test("githubParts accepts owner/repo and github urls", () => {
  assert.deepEqual(githubParts("Ghostpanter/blog"), { owner: "Ghostpanter", name: "blog" });
  assert.deepEqual(githubParts("https://github.com/Ghostpanter/blog.git"), {
    owner: "Ghostpanter",
    name: "blog",
  });
  assert.deepEqual(githubParts("https://gitee.com/owner/blog.git"), {
    owner: "owner",
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

test("buildPostFile keeps existing front matter and extra yaml", () => {
  const note: Note = {
    id: "n2",
    content: "---\ntitle: \"已有\"\n---\n\n正文\n",
    createdAt: 1,
    updatedAt: 1,
  };
  const kept = buildPostFile(note, "hugo");
  assert.match(kept, /title: "已有"/);
  const wrapped = buildPostFile(
    { ...note, content: "# 新\n\n正文\n" },
    "hugo",
    new Date(2026, 8, 15, 3, 0, 0),
    "tags: [静笺]",
  );
  assert.match(wrapped, /tags: \[静笺\]/);
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

test("isPostFilename keeps markdown and skips index or hidden files", () => {
  assert.equal(isPostFilename("hello.md"), true);
  assert.equal(isPostFilename("hello.markdown"), true);
  assert.equal(isPostFilename("hello.mdx"), true);
  assert.equal(isPostFilename("_index.md"), false);
  assert.equal(isPostFilename(".hidden.md"), false);
  assert.equal(isPostFilename("hello.txt"), false);
});

test("titleFromPostName strips date prefixes and uses parent for index", () => {
  assert.equal(titleFromPostName("content/posts/2026-09-15-hello-world.md"), "hello world");
  assert.equal(titleFromPostName("source/_posts/数据库.md"), "数据库");
  assert.equal(titleFromPostName("content/posts/foo/index.md"), "foo");
});

test("titleFromPostContent prefers yaml title", () => {
  assert.equal(titleFromPostContent('---\ntitle: "窗边"\n---\n\n正文', "fallback"), "窗边");
  assert.equal(titleFromPostContent("", "fallback"), "fallback");
});

test("decodeGitContent reads base64 utf8", () => {
  const text = "你好，静笺";
  const b64 = Buffer.from(text, "utf8").toString("base64");
  assert.equal(decodeGitContent(b64, "base64"), text);
  assert.equal(decodeGitContent("", "base64"), "");
});

test("collectDirectPosts skips index, dots, and keeps nested dirs", () => {
  const { files, dirs } = collectDirectPosts(
    normalizeRepoEntries([
      { name: "a.md", path: "content/posts/a.md", type: "file", sha: "1", size: 12 },
      { name: "_index.md", path: "content/posts/_index.md", type: "file" },
      { name: ".gitkeep", path: "content/posts/.gitkeep", type: "file" },
      { name: "nested", path: "content/posts/nested", type: "dir" },
      { name: "readme.txt", path: "content/posts/readme.txt", type: "file" },
    ]),
  );
  assert.equal(files.length, 1);
  assert.equal(files[0]?.path, "content/posts/a.md");
  assert.deepEqual(dirs, ["content/posts/nested"]);
});

test("blogNoteId is stable across url forms and host-specific", () => {
  assert.equal(
    blogNoteId("github", "Ghostpanter/blog", "content/posts/a.md"),
    blogNoteId("github", "https://github.com/Ghostpanter/blog.git", "content/posts/a.md"),
  );
  assert.notEqual(
    blogNoteId("github", "Ghostpanter/blog", "a.md"),
    blogNoteId("gitee", "Ghostpanter/blog", "a.md"),
  );
});

test("localIdForBlogPost matches generated id when the note exists", () => {
  const path = "content/posts/a.md";
  const id = blogNoteId("github", "owner/blog", path);
  assert.equal(
    localIdForBlogPost(path, "github", "owner/blog", () => false),
    null,
  );
  assert.equal(
    localIdForBlogPost(path, "github", "owner/blog", (item) => item === id),
    id,
  );
});

