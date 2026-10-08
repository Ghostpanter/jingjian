import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ghostAdminToken,
  normalizePlatformPrefs,
  platformReady,
  publishPlan,
  siteBase,
  stripFrontMatterBlock,
  xmlEscape,
  xmlRpcCall,
  xmlRpcFault,
  xmlString,
  yuqueParts,
  type PlatformPrefs,
} from "./blog-platforms.ts";

test("site address drops admin paths and keeps a subdirectory", () => {
  assert.equal(siteBase("blog.example.com/wp-admin"), "https://blog.example.com");
  assert.equal(siteBase("https://example.com/notes/"), "https://example.com/notes");
  assert.throws(() => siteBase(""), /站点地址/);
});

test("yuque repo accepts a path or a url", () => {
  assert.deepEqual(yuqueParts("alice/notes"), { login: "alice", book: "notes" });
  assert.deepEqual(yuqueParts("https://www.yuque.com/alice/notes/"), { login: "alice", book: "notes" });
  assert.throws(() => yuqueParts("alice"), /知识库/);
});

test("front matter is removed before the article body", () => {
  assert.equal(stripFrontMatterBlock("---\ntitle: 标题\n---\n\n正文"), "正文");
  assert.equal(stripFrontMatterBlock("# 标题\n\n正文"), "# 标题\n\n正文");
});

test("typecho xml escapes text and reports a fault", () => {
  const call = xmlRpcCall("metaWeblog.newPost", [xmlString("A & B")]);
  assert.match(call, /<methodName>metaWeblog.newPost<\/methodName>/);
  assert.match(call, /<string>A &amp; B<\/string>/);
  assert.equal(xmlEscape("<p>"), "&lt;p&gt;");
  assert.equal(xmlEscape("A & B"), "A &amp; B");
  assert.match(xmlRpcFault("<fault><value><struct><member><name>faultString</name><value><string>密码错误</string></value></member></struct></value></fault>") ?? "", /密码错误/);
});

test("an old library still publishes the git blog immediately", () => {
  const prefs = normalizePlatformPrefs(null);
  assert.equal(prefs.defaultsSet, false);
  assert.deepEqual(publishPlan(prefs, { token: "t", repo: "a/b" }), { mode: "now", ids: ["git"] });
  assert.deepEqual(publishPlan(prefs, { token: "", repo: "" }), { mode: "settings" });
});

test("empty defaults ask at publish time, checked defaults go out together", () => {
  const prefs: PlatformPrefs = {
    ...normalizePlatformPrefs(null),
    defaultsSet: true,
    defaults: [],
    gitEnabled: false,
    wordpress: { enabled: true, site: "https://blog.example.com", username: "me", password: "app", status: "publish", category: "", tags: "", cover: "" },
  };
  assert.equal(platformReady(prefs, "wordpress", { token: "", repo: "" }), true);
  assert.deepEqual(publishPlan(prefs, { token: "", repo: "" }), { mode: "choose", ids: ["wordpress"] });
  const chosen: PlatformPrefs = { ...prefs, defaults: ["wordpress"] };
  assert.deepEqual(publishPlan(chosen, { token: "", repo: "" }), { mode: "now", ids: ["wordpress"] });
});

test("ghost admin token is a signed jwt", async () => {
  const token = await ghostAdminToken(`abc:${"ab".repeat(16)}`, Date.parse("2026-10-03T00:00:00Z"));
  assert.equal(token.split(".").length, 3);
  assert.match(token.split(".")[0] ?? "", /^[A-Za-z0-9_-]+$/);
});

test("wordpress cover becomes a featured image only after a sideload", async () => {
  const { wordpressArticleFields } = await import("./blog-platform-publish.ts");
  const plain = wordpressArticleFields("<p>正文</p>", "", null);
  assert.equal(plain.content, "<p>正文</p>");
  assert.equal(plain.featured_media, undefined);
  const prepended = wordpressArticleFields("<p>正文</p>", "https://cdn.example/a.jpg", null);
  assert.match(prepended.content, /img/);
  const featured = wordpressArticleFields("<p>正文</p>", "https://cdn.example/a.jpg", 12);
  assert.equal(featured.content, "<p>正文</p>");
  assert.equal(featured.featured_media, 12);
});
