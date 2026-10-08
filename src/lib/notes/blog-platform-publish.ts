import { desktopRequest, isDesktopApp } from "./desktop.ts";
import { escapeHtml } from "./escape-html.ts";
import { firstLineTitle } from "./format.ts";
import { htmlToMarkdown } from "./html-to-markdown.ts";
import { ensureKatex, extractMath } from "./markdown-extra.ts";
import { renderMarkdown } from "./markdown.ts";
import { postSlug, publishNoteToBlog, stripMatchingHeading, testBlogConfig } from "./blog-publish.ts";
import type { BlogConfig } from "./blog-config.ts";
import type { Note } from "./types.ts";
import {
  ghostAdminToken,
  metaList,
  platformLabel,
  rememberTarget,
  siteBase,
  stripFrontMatterBlock,
  targetFor,
  xmlRpcCall,
  xmlRpcFault,
  xmlRpcString,
  xmlRpcStructs,
  xmlString,
  yuqueParts,
  type GhostSite,
  type HaloSite,
  type PlatformId,
  type PlatformPrefs,
  type TypechoSite,
  type WordPressSite,
  type YuqueSite,
} from "./blog-platforms.ts";

export type PlatformPublishResult = {
  id: PlatformId;
  label: string;
  detail: string;
  updated: boolean;
};

async function platformFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const timeoutMs = 25_000;
  if (isDesktopApp()) {
    try {
      return await desktopRequest(url, { ...init, timeoutMs });
    } catch (error) {
      if (error instanceof Error && error.message === "连接超时") throw error;
      throw new Error("连不上这个站点");
    }
  }
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("连接超时");
    throw new Error("连不上这个站点。网页里发布若被拦住，请用安卓或电脑应用。");
  } finally {
    window.clearTimeout(timer);
  }
}

async function errorText(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const data = JSON.parse(text) as { message?: unknown; detail?: unknown; error?: unknown };
    for (const value of [data.message, data.detail, data.error]) {
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  } catch {
    // not json
  }
  return text.trim().slice(0, 160);
}

function httpError(name: string, status: number, message: string): Error {
  if (status === 401 || status === 403) return new Error(`${name}：账号或密钥不对`);
  if (status === 404) return new Error(`${name}：地址不对，或接口没打开`);
  return new Error(message ? `${name}：${message}` : `${name} 失败（${status}）`);
}

export async function articleFromNote(content: string): Promise<{ title: string; markdown: string; html: string }> {
  const source = stripFrontMatterBlock(content);
  const title = firstLineTitle(source);
  const markdown = stripMatchingHeading(source, title).replace(/^\s+/, "");
  const body = markdown || source;
  if (extractMath(body).slots.length) await ensureKatex();
  const html = renderMarkdown(body);
  return { title, markdown, html };
}

function assertArticle(content: string): Promise<{ title: string; markdown: string; html: string }> {
  return articleFromNote(content).then((article) => {
    if (article.title === "未命名笔记" && !content.trim()) throw new Error("这篇还没有内容");
    return article;
  });
}

function withCoverMarkdown(markdown: string, cover: string | undefined): string {
  const url = cover?.trim() ?? "";
  if (!url || markdown.includes(url)) return markdown;
  return `![](${url})\n\n${markdown}`;
}

function withCoverHtml(html: string, cover: string | undefined): string {
  const url = cover?.trim() ?? "";
  if (!url || html.includes(url)) return html;
  return `<p><img src="${escapeHtml(url)}" alt="" /></p>\n${html}`;
}

export function wordpressArticleFields(
  html: string,
  cover: string | undefined,
  featuredId: number | null,
): { content: string; featured_media?: number } {
  if (featuredId && featuredId > 0) return { content: html, featured_media: featuredId };
  return { content: withCoverHtml(html, cover) };
}

function coverFileName(url: string, mime: string): string {
  const ext = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : mime.includes("gif")
        ? "gif"
        : "jpg";
  try {
    const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "");
    const clean = name.replace(/[^\w.\-]+/g, "_").slice(0, 80);
    if (/\.(jpe?g|png|gif|webp)$/i.test(clean)) return clean;
  } catch {
    // keep the generated name
  }
  return `cover.${ext}`;
}

async function sideloadWordPressCover(
  base: string,
  site: WordPressSite,
  cover: string,
): Promise<number | null> {
  const url = cover.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  let response: Response;
  try {
    response = await platformFetch(url);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const blob = await response.blob();
  if (!blob.size || blob.size > 12_000_000) return null;
  const hinted = blob.type.startsWith("image/") ? blob.type : "";
  const fromUrl = /\.png($|\?)/i.test(url)
    ? "image/png"
    : /\.webp($|\?)/i.test(url)
      ? "image/webp"
      : /\.gif($|\?)/i.test(url)
        ? "image/gif"
        : "image/jpeg";
  const mime = hinted || fromUrl;
  if (!mime.startsWith("image/")) return null;
  const filename = coverFileName(url, mime);
  const file = new File([blob], filename, { type: mime });
  const uploaded = await platformFetch(`${base}/wp-json/wp/v2/media`, {
    method: "POST",
    headers: {
      Authorization: basicAuth(site.username, site.password),
      "Content-Type": mime,
      "Content-Disposition": `attachment; filename="${filename.replace(/"/g, "")}"`,
      Accept: "application/json",
    },
    body: file,
  });
  if (!uploaded.ok) return null;
  const payload = (await uploaded.json()) as { id?: number };
  return typeof payload.id === "number" && payload.id > 0 ? payload.id : null;
}

function xmlArray(values: string[]): string {
  return `<array><data>${values.map((value) => `<value>${xmlString(value)}</value>`).join("")}</data></array>`;
}

export async function testWordPress(site: WordPressSite): Promise<string> {
  const base = siteBase(site.site);
  const response = await platformFetch(`${base}/wp-json/wp/v2/users/me`, {
    headers: { Authorization: basicAuth(site.username, site.password), Accept: "application/json" },
  });
  if (!response.ok) throw httpError("WordPress", response.status, await errorText(response));
  return `已连接 WordPress ${base}`;
}

export async function publishWordPress(noteId: string, content: string, site: WordPressSite): Promise<PlatformPublishResult> {
  const article = await assertArticle(content);
  const base = siteBase(site.site);
  const previous = targetFor(noteId, "wordpress");
  const categories = metaList(site.category);
  const tags = metaList(site.tags);
  const categoryIds = [];
  for (const name of categories) categoryIds.push(await wpTermId(base, site, "categories", name));
  const tagIds = [];
  for (const name of tags) tagIds.push(await wpTermId(base, site, "tags", name));
  let featured: number | null = null;
  const cover = site.cover?.trim() ?? "";
  if (cover) {
    try {
      featured = await sideloadWordPressCover(base, site, cover);
    } catch {
      featured = null;
    }
  }
  const fields = wordpressArticleFields(article.html, site.cover, featured);
  const path = previous
    ? `${base}/wp-json/wp/v2/posts/${encodeURIComponent(previous.remoteId)}`
    : `${base}/wp-json/wp/v2/posts`;
  const body: Record<string, unknown> = {
    title: article.title,
    content: fields.content,
    status: site.status,
    slug: postSlug(article.title),
  };
  if (fields.featured_media) body.featured_media = fields.featured_media;
  if (categoryIds.length) body.categories = categoryIds;
  if (tagIds.length) body.tags = tagIds;
  const response = await platformFetch(path, {
    method: "POST",
    headers: {
      Authorization: basicAuth(site.username, site.password),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw httpError("WordPress", response.status, await errorText(response));
  const payload = (await response.json()) as { id?: number; link?: string };
  const remoteId = payload.id != null ? String(payload.id) : previous?.remoteId || "";
  const url = payload.link || previous?.url || base;
  if (remoteId) rememberTarget(noteId, "wordpress", remoteId, url);
  return { id: "wordpress", label: "WordPress", detail: url, updated: Boolean(previous) };
}

function basicAuth(username: string, password: string): string {
  const token = utf8ToB64(`${username.trim()}:${password.replace(/\s+/g, "")}`);
  return `Basic ${token}`;
}

async function wpTermId(
  base: string,
  site: WordPressSite,
  kind: "categories" | "tags",
  name: string,
): Promise<number> {
  const headers = {
    Authorization: basicAuth(site.username, site.password),
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  const search = await platformFetch(
    `${base}/wp-json/wp/v2/${kind}?search=${encodeURIComponent(name)}&per_page=20`,
    { headers },
  );
  if (search.ok) {
    const list = (await search.json()) as { id?: number; name?: string }[];
    const found = list.find((item) => item.name?.toLowerCase() === name.toLowerCase());
    if (found?.id != null) return found.id;
  }
  const created = await platformFetch(`${base}/wp-json/wp/v2/${kind}`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name }),
  });
  if (!created.ok) throw httpError("WordPress", created.status, await errorText(created));
  const payload = (await created.json()) as { id?: number };
  if (payload.id == null) throw new Error(`WordPress：没有建成${kind === "tags" ? "标签" : "分类"}`);
  return payload.id;
}

function utf8ToB64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export async function testTypecho(site: TypechoSite): Promise<string> {
  const xml = await typechoCall(
    site,
    xmlRpcCall("blogger.getUsersBlogs", [
      xmlString("jingjian"),
      xmlString(site.username.trim()),
      xmlString(site.password),
    ]),
  );
  if (!xml.includes("<array>") && !xml.includes("<struct>")) throw new Error("Typecho 没有返回站点");
  return `已连接 Typecho ${siteBase(site.site)}`;
}

export async function publishTypecho(noteId: string, content: string, site: TypechoSite): Promise<PlatformPublishResult> {
  const article = await assertArticle(content);
  const markdown = withCoverMarkdown(article.markdown || article.title, site.cover);
  const members = [
    `<member><name>title</name><value>${xmlString(article.title)}</value></member>`,
    `<member><name>description</name><value>${xmlString(markdown)}</value></member>`,
  ];
  const categories = metaList(site.category);
  const tags = metaList(site.tags);
  if (categories.length) {
    members.push(`<member><name>categories</name><value>${xmlArray(categories)}</value></member>`);
  }
  if (tags.length) {
    members.push(`<member><name>mt_keywords</name><value>${xmlString(tags.join(","))}</value></member>`);
  }
  const struct = `<struct>${members.join("")}</struct>`;
  const previous = targetFor(noteId, "typecho");
  const xml = previous
    ? await typechoCall(
        site,
        xmlRpcCall("metaWeblog.editPost", [
          xmlString(previous.remoteId),
          xmlString(site.username.trim()),
          xmlString(site.password),
          struct,
          `<boolean>${site.publish ? 1 : 0}</boolean>`,
        ]),
      )
    : await typechoCall(
        site,
        xmlRpcCall("metaWeblog.newPost", [
          xmlString(""),
          xmlString(site.username.trim()),
          xmlString(site.password),
          struct,
          `<boolean>${site.publish ? 1 : 0}</boolean>`,
        ]),
      );
  const remoteId = xmlRpcString(xml) || previous?.remoteId || "";
  const url = previous?.url || siteBase(site.site);
  if (remoteId) rememberTarget(noteId, "typecho", remoteId, url);
  return { id: "typecho", label: "Typecho", detail: remoteId ? `文章 ${remoteId}` : url, updated: Boolean(previous) };
}

async function typechoCall(site: TypechoSite, body: string): Promise<string> {
  const base = siteBase(site.site);
  const urls = /xmlrpc/i.test(site.site)
    ? [site.site.trim()]
    : [`${base}/index.php/action/xmlrpc`, `${base}/action/xmlrpc`];
  let last = "连不上 Typecho";
  for (const url of urls) {
    const response = await platformFetch(url, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body,
    });
    if (response.status === 404) {
      last = "找不到 Typecho 的 XML-RPC";
      continue;
    }
    const text = await response.text();
    if (!response.ok) {
      last = `Typecho 失败（${response.status}）`;
      continue;
    }
    const fault = xmlRpcFault(text);
    if (fault) throw new Error(`Typecho：${fault}`);
    return text;
  }
  throw new Error(last);
}

export async function testHalo(site: HaloSite): Promise<string> {
  const base = siteBase(site.site);
  const response = await platformFetch(`${base}/apis/api.console.halo.run/v1alpha1/posts?page=1&size=1`, {
    headers: haloHeaders(site.token),
  });
  if (!response.ok) throw httpError("Halo", response.status, await errorText(response));
  return `已连接 Halo ${base}`;
}

export async function publishHalo(noteId: string, content: string, site: HaloSite): Promise<PlatformPublishResult> {
  const article = await assertArticle(content);
  const base = siteBase(site.site);
  const previous = targetFor(noteId, "halo");
  const markdown = `# ${article.title}\n\n${article.markdown}`.trim();
  const tags = await haloNames(base, site.token, "tags", metaList(site.tags));
  const categories = await haloNames(base, site.token, "categories", metaList(site.category));
  const cover = site.cover.trim();
  if (previous) {
    const response = await platformFetch(
      `${base}/apis/api.console.halo.run/v1alpha1/posts/${encodeURIComponent(previous.remoteId)}/content`,
      {
        method: "PUT",
        headers: { ...haloHeaders(site.token), "Content-Type": "application/json" },
        body: JSON.stringify({ raw: markdown, content: markdown, rawType: "markdown" }),
      },
    );
    if (!response.ok) throw httpError("Halo", response.status, await errorText(response));
    await haloSetVisibility(base, site, previous.remoteId);
    if (cover || tags.length || categories.length) {
      await haloPatchSpec(base, site.token, previous.remoteId, { cover, tags, categories });
    }
    return { id: "halo", label: "Halo", detail: previous.url, updated: true };
  }
  const response = await platformFetch(`${base}/apis/api.console.halo.run/v1alpha1/posts`, {
    method: "POST",
    headers: { ...haloHeaders(site.token), "Content-Type": "application/json" },
    body: JSON.stringify({
      post: {
        apiVersion: "content.halo.run/v1alpha1",
        kind: "Post",
        metadata: { name: "", generateName: "post-" },
        spec: {
          title: article.title,
          slug: postSlug(article.title),
          template: "",
          cover,
          deleted: false,
          publish: site.publish,
          pinned: false,
          allowComment: true,
          visible: "PUBLIC",
          priority: 0,
          excerpt: { autoGenerate: true, raw: "" },
          categories,
          tags,
          htmlMetas: [],
        },
      },
      content: { raw: markdown, content: markdown, rawType: "markdown" },
    }),
  });
  if (!response.ok) throw httpError("Halo", response.status, await errorText(response));
  const payload = (await response.json()) as {
    metadata?: { name?: string };
    post?: { metadata?: { name?: string }; status?: { permalink?: string } };
    status?: { permalink?: string };
  };
  const remoteId = payload.post?.metadata?.name || payload.metadata?.name || "";
  const url = payload.post?.status?.permalink || payload.status?.permalink || base;
  if (remoteId) rememberTarget(noteId, "halo", remoteId, url);
  return { id: "halo", label: "Halo", detail: url, updated: false };
}

async function haloSetVisibility(base: string, site: HaloSite, name: string) {
  const action = site.publish ? "publish" : "unpublish";
  const response = await platformFetch(
    `${base}/apis/api.console.halo.run/v1alpha1/posts/${encodeURIComponent(name)}/${action}`,
    { method: "POST", headers: haloHeaders(site.token) },
  );
  if (response.ok || response.status === 400) return;
  throw httpError("Halo", response.status, await errorText(response));
}

async function haloNames(
  base: string,
  token: string,
  kind: "tags" | "categories",
  names: string[],
): Promise<string[]> {
  const out: string[] = [];
  for (const displayName of names) out.push(await haloEnsure(base, token, kind, displayName));
  return out;
}

async function haloEnsure(
  base: string,
  token: string,
  kind: "tags" | "categories",
  displayName: string,
): Promise<string> {
  const headers = { ...haloHeaders(token), "Content-Type": "application/json" };
  const list = await platformFetch(`${base}/apis/content.halo.run/v1alpha1/${kind}?page=0&size=200`, {
    headers,
  });
  if (!list.ok) throw httpError("Halo", list.status, await errorText(list));
  const data = (await list.json()) as {
    items?: { metadata?: { name?: string }; spec?: { displayName?: string } }[];
  };
  const found = data.items?.find((item) => item.spec?.displayName === displayName);
  if (found?.metadata?.name) return found.metadata.name;
  const created = await platformFetch(`${base}/apis/content.halo.run/v1alpha1/${kind}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      apiVersion: "content.halo.run/v1alpha1",
      kind: kind === "tags" ? "Tag" : "Category",
      metadata: { generateName: kind === "tags" ? "tag-" : "category-" },
      spec: { displayName, slug: postSlug(displayName) || "item", cover: "" },
    }),
  });
  if (!created.ok) throw httpError("Halo", created.status, await errorText(created));
  const payload = (await created.json()) as { metadata?: { name?: string } };
  if (!payload.metadata?.name) throw new Error(kind === "tags" ? "Halo：标签没有建成" : "Halo：分类没有建成");
  return payload.metadata.name;
}

async function haloPatchSpec(
  base: string,
  token: string,
  name: string,
  meta: { cover: string; tags: string[]; categories: string[] },
) {
  const url = `${base}/apis/content.halo.run/v1alpha1/posts/${encodeURIComponent(name)}`;
  const headers = { ...haloHeaders(token), "Content-Type": "application/json" };
  const current = await platformFetch(url, { headers });
  if (!current.ok) throw httpError("Halo", current.status, await errorText(current));
  const post = (await current.json()) as { spec?: Record<string, unknown> };
  const spec = { ...(post.spec ?? {}) };
  if (meta.cover) spec.cover = meta.cover;
  if (meta.tags.length) spec.tags = meta.tags;
  if (meta.categories.length) spec.categories = meta.categories;
  post.spec = spec;
  const saved = await platformFetch(url, { method: "PUT", headers, body: JSON.stringify(post) });
  if (!saved.ok) throw httpError("Halo", saved.status, await errorText(saved));
}

function haloHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token.trim()}`, Accept: "application/json" };
}

export async function testGhost(site: GhostSite): Promise<string> {
  const base = siteBase(site.site);
  const token = await ghostAdminToken(site.adminKey);
  const response = await platformFetch(`${base}/ghost/api/admin/site/`, {
    headers: { Authorization: `Ghost ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw httpError("Ghost", response.status, await errorText(response));
  return `已连接 Ghost ${base}`;
}

export async function publishGhost(noteId: string, content: string, site: GhostSite): Promise<PlatformPublishResult> {
  const article = await assertArticle(content);
  const base = siteBase(site.site);
  const token = await ghostAdminToken(site.adminKey);
  const headers = {
    Authorization: `Ghost ${token}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
  const previous = targetFor(noteId, "ghost");
  let updatedAt: string | undefined;
  if (previous) {
    const current = await platformFetch(`${base}/ghost/api/admin/posts/${encodeURIComponent(previous.remoteId)}/`, {
      headers,
    });
    if (!current.ok) throw httpError("Ghost", current.status, await errorText(current));
    const found = (await current.json()) as { posts?: { updated_at?: string }[] };
    updatedAt = found.posts?.[0]?.updated_at;
  }
  const path = previous
    ? `${base}/ghost/api/admin/posts/${encodeURIComponent(previous.remoteId)}/?source=html`
    : `${base}/ghost/api/admin/posts/?source=html`;
  const names = [...metaList(site.tags)];
  const category = site.category.trim();
  if (category && !names.some((item) => item.toLowerCase() === category.toLowerCase())) names.push(category);
  const post: Record<string, unknown> = {
    title: article.title,
    html: article.html || `<p>${article.title}</p>`,
    status: site.status,
  };
  if (names.length) post.tags = names.map((name) => ({ name }));
  if (site.cover.trim()) post.feature_image = site.cover.trim();
  if (updatedAt) post.updated_at = updatedAt;
  const response = await platformFetch(path, {
    method: previous ? "PUT" : "POST",
    headers,
    body: JSON.stringify({ posts: [post] }),
  });
  if (!response.ok) throw httpError("Ghost", response.status, await errorText(response));
  const payload = (await response.json()) as { posts?: { id?: string; url?: string }[] };
  const created = payload.posts?.[0];
  const remoteId = created?.id || previous?.remoteId || "";
  const url = created?.url || previous?.url || base;
  if (remoteId) rememberTarget(noteId, "ghost", remoteId, url);
  return { id: "ghost", label: "Ghost", detail: url, updated: Boolean(previous) };
}

export async function testYuque(site: YuqueSite): Promise<string> {
  const { login, book } = yuqueParts(site.repo);
  const response = await platformFetch("https://www.yuque.com/api/v2/user", {
    headers: { "X-Auth-Token": site.token.trim(), Accept: "application/json" },
  });
  if (!response.ok) throw httpError("语雀", response.status, await errorText(response));
  return `已连接语雀 ${login}/${book}`;
}

export async function publishYuque(noteId: string, content: string, site: YuqueSite): Promise<PlatformPublishResult> {
  const article = await assertArticle(content);
  const { login, book } = yuqueParts(site.repo);
  const previous = targetFor(noteId, "yuque");
  const path = previous
    ? `https://www.yuque.com/api/v2/repos/${encodeURIComponent(login)}/${encodeURIComponent(book)}/docs/${encodeURIComponent(previous.remoteId)}`
    : `https://www.yuque.com/api/v2/repos/${encodeURIComponent(login)}/${encodeURIComponent(book)}/docs`;
  const response = await platformFetch(path, {
    method: previous ? "PUT" : "POST",
    headers: {
      "X-Auth-Token": site.token.trim(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: article.title,
      slug: postSlug(article.title),
      public: site.public ? 1 : 0,
      format: "markdown",
      body: withCoverMarkdown(article.markdown || article.title, site.cover),
    }),
  });
  if (!response.ok) throw httpError("语雀", response.status, await errorText(response));
  const payload = (await response.json()) as { data?: { id?: number; slug?: string } };
  const remoteId = payload.data?.id != null ? String(payload.data.id) : previous?.remoteId || "";
  const slug = payload.data?.slug || postSlug(article.title);
  const url = `https://www.yuque.com/${login}/${book}/${slug}`;
  if (remoteId) rememberTarget(noteId, "yuque", remoteId, url);
  return { id: "yuque", label: "语雀", detail: url, updated: Boolean(previous) };
}

export async function testSelectedPlatform(prefs: PlatformPrefs, config: BlogConfig): Promise<string> {
  if (prefs.selected === "git") return testBlogConfig(config);
  if (prefs.selected === "wordpress") return testWordPress(prefs.wordpress);
  if (prefs.selected === "typecho") return testTypecho(prefs.typecho);
  if (prefs.selected === "halo") return testHalo(prefs.halo);
  if (prefs.selected === "ghost") return testGhost(prefs.ghost);
  return testYuque(prefs.yuque);
}

export async function publishPlatforms(
  note: Note,
  ids: PlatformId[],
  prefs: PlatformPrefs,
  config: BlogConfig,
): Promise<{ ok: PlatformPublishResult[]; failed: { label: string; message: string }[] }> {
  const ok: PlatformPublishResult[] = [];
  const failed: { label: string; message: string }[] = [];
  for (const id of ids) {
    try {
      if (id === "git") {
        const result = await publishNoteToBlog(note, config);
        ok.push({
          id,
          label: "静态博客",
          detail: result.path,
          updated: result.updated,
        });
        continue;
      }
      if (id === "wordpress") ok.push(await publishWordPress(note.id, note.content, prefs.wordpress));
      else if (id === "typecho") ok.push(await publishTypecho(note.id, note.content, prefs.typecho));
      else if (id === "halo") ok.push(await publishHalo(note.id, note.content, prefs.halo));
      else if (id === "ghost") ok.push(await publishGhost(note.id, note.content, prefs.ghost));
      else ok.push(await publishYuque(note.id, note.content, prefs.yuque));
    } catch (error) {
      failed.push({
        label: platformLabel(id),
        message: error instanceof Error ? error.message : "发布失败",
      });
    }
  }
  return { ok, failed };
}

export type RemotePost = {
  remoteId: string;
  title: string;
  url: string;
  hint: string;
};

export type RemotePostFile = RemotePost & { content: string };

function plainTitle(value: string): string {
  return value.replace(/<[^>]+>/g, "").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").trim();
}

function asMarkdown(title: string, body: string): string {
  const text = body.replace(/^\uFEFF/, "").trim();
  if (!text) return `# ${title}\n\n`;
  if (text.startsWith("#")) return text.endsWith("\n") ? text : `${text}\n`;
  return `# ${title}\n\n${text}\n`;
}

export async function listRemotePosts(id: PlatformId, prefs: PlatformPrefs): Promise<RemotePost[]> {
  if (id === "wordpress") return listWordPress(prefs.wordpress);
  if (id === "typecho") return listTypecho(prefs.typecho);
  if (id === "halo") return listHalo(prefs.halo);
  if (id === "ghost") return listGhost(prefs.ghost);
  if (id === "yuque") return listYuque(prefs.yuque);
  return [];
}

export async function readRemotePost(
  id: PlatformId,
  prefs: PlatformPrefs,
  remoteId: string,
): Promise<RemotePostFile> {
  if (id === "wordpress") return readWordPress(prefs.wordpress, remoteId);
  if (id === "typecho") return readTypecho(prefs.typecho, remoteId);
  if (id === "halo") return readHalo(prefs.halo, remoteId);
  if (id === "ghost") return readGhost(prefs.ghost, remoteId);
  if (id === "yuque") return readYuque(prefs.yuque, remoteId);
  throw new Error("这个平台不能拉回");
}

async function listWordPress(site: WordPressSite): Promise<RemotePost[]> {
  const base = siteBase(site.site);
  const response = await platformFetch(
    `${base}/wp-json/wp/v2/posts?per_page=30&context=edit&status=publish,future,draft,pending,private&_fields=id,title,link,status`,
    { headers: { Authorization: basicAuth(site.username, site.password), Accept: "application/json" } },
  );
  if (!response.ok) throw httpError("WordPress", response.status, await errorText(response));
  const posts = (await response.json()) as {
    id?: number;
    link?: string;
    status?: string;
    title?: { raw?: string; rendered?: string };
  }[];
  return posts.map((post) => ({
    remoteId: String(post.id ?? ""),
    title: plainTitle(post.title?.raw || post.title?.rendered || "未命名"),
    url: post.link || base,
    hint: post.status === "draft" ? "草稿" : "WordPress",
  })).filter((post) => post.remoteId);
}

async function readWordPress(site: WordPressSite, remoteId: string): Promise<RemotePostFile> {
  const base = siteBase(site.site);
  const response = await platformFetch(`${base}/wp-json/wp/v2/posts/${encodeURIComponent(remoteId)}?context=edit`, {
    headers: { Authorization: basicAuth(site.username, site.password), Accept: "application/json" },
  });
  if (!response.ok) throw httpError("WordPress", response.status, await errorText(response));
  const post = (await response.json()) as {
    id?: number;
    link?: string;
    title?: { raw?: string; rendered?: string };
    content?: { raw?: string; rendered?: string };
  };
  const title = plainTitle(post.title?.raw || post.title?.rendered || "未命名");
  const raw = post.content?.raw?.trim();
  const body = raw || htmlToMarkdown(post.content?.rendered || "");
  return { remoteId: String(post.id ?? remoteId), title, url: post.link || base, hint: "WordPress", content: asMarkdown(title, body) };
}

async function listTypecho(site: TypechoSite): Promise<RemotePost[]> {
  const xml = await typechoCall(
    site,
    xmlRpcCall("metaWeblog.getRecentPosts", [
      xmlString(""),
      xmlString(site.username.trim()),
      xmlString(site.password),
      "<int>30</int>",
    ]),
  );
  return xmlRpcStructs(xml)
    .map((item) => ({
      remoteId: item.postid || item.postId || "",
      title: item.title || "未命名",
      url: item.link || item.permaLink || siteBase(site.site),
      hint: "Typecho",
    }))
    .filter((item) => item.remoteId);
}

async function readTypecho(site: TypechoSite, remoteId: string): Promise<RemotePostFile> {
  const xml = await typechoCall(
    site,
    xmlRpcCall("metaWeblog.getPost", [
      xmlString(remoteId),
      xmlString(site.username.trim()),
      xmlString(site.password),
    ]),
  );
  const item = xmlRpcStructs(xml)[0];
  if (!item) throw new Error("Typecho 没有这篇文章");
  const title = item.title || "未命名";
  return {
    remoteId,
    title,
    url: item.link || item.permaLink || siteBase(site.site),
    hint: "Typecho",
    content: asMarkdown(title, item.description || ""),
  };
}

async function listHalo(site: HaloSite): Promise<RemotePost[]> {
  const base = siteBase(site.site);
  const response = await platformFetch(`${base}/apis/api.console.halo.run/v1alpha1/posts?page=1&size=30`, {
    headers: haloHeaders(site.token),
  });
  if (!response.ok) throw httpError("Halo", response.status, await errorText(response));
  const data = (await response.json()) as {
    items?: {
      post?: { metadata?: { name?: string }; spec?: { title?: string; publish?: boolean }; status?: { permalink?: string } };
      metadata?: { name?: string };
      spec?: { title?: string; publish?: boolean };
      status?: { permalink?: string };
    }[];
  };
  return (data.items ?? [])
    .map((item) => {
      const post = item.post ?? item;
      const remoteId = post.metadata?.name || "";
      return {
        remoteId,
        title: post.spec?.title || remoteId || "未命名",
        url: post.status?.permalink || base,
        hint: post.spec?.publish === false ? "草稿" : "Halo",
      };
    })
    .filter((item) => item.remoteId);
}

async function readHalo(site: HaloSite, remoteId: string): Promise<RemotePostFile> {
  const base = siteBase(site.site);
  const response = await platformFetch(
    `${base}/apis/api.console.halo.run/v1alpha1/posts/${encodeURIComponent(remoteId)}/content`,
    { headers: haloHeaders(site.token) },
  );
  if (!response.ok) throw httpError("Halo", response.status, await errorText(response));
  const data = (await response.json()) as { raw?: string; content?: string };
  const body = data.raw || data.content || "";
  const title = firstLineTitle(body);
  return { remoteId, title, url: base, hint: "Halo", content: asMarkdown(title === "未命名笔记" ? remoteId : title, body) };
}

async function listGhost(site: GhostSite): Promise<RemotePost[]> {
  const base = siteBase(site.site);
  const token = await ghostAdminToken(site.adminKey);
  const response = await platformFetch(`${base}/ghost/api/admin/posts/?limit=30`, {
    headers: { Authorization: `Ghost ${token}`, Accept: "application/json" },
  });
  if (!response.ok) throw httpError("Ghost", response.status, await errorText(response));
  const data = (await response.json()) as { posts?: { id?: string; title?: string; url?: string; status?: string }[] };
  return (data.posts ?? [])
    .map((post) => ({
      remoteId: post.id || "",
      title: post.title || "未命名",
      url: post.url || base,
      hint: post.status === "draft" ? "草稿" : "Ghost",
    }))
    .filter((post) => post.remoteId);
}

async function readGhost(site: GhostSite, remoteId: string): Promise<RemotePostFile> {
  const base = siteBase(site.site);
  const token = await ghostAdminToken(site.adminKey);
  const response = await platformFetch(
    `${base}/ghost/api/admin/posts/${encodeURIComponent(remoteId)}/?formats=html`,
    { headers: { Authorization: `Ghost ${token}`, Accept: "application/json" } },
  );
  if (!response.ok) throw httpError("Ghost", response.status, await errorText(response));
  const data = (await response.json()) as { posts?: { id?: string; title?: string; url?: string; html?: string }[] };
  const post = data.posts?.[0];
  if (!post) throw new Error("Ghost 没有这篇文章");
  const title = post.title || "未命名";
  return {
    remoteId: post.id || remoteId,
    title,
    url: post.url || base,
    hint: "Ghost",
    content: asMarkdown(title, htmlToMarkdown(post.html || "")),
  };
}

async function listYuque(site: YuqueSite): Promise<RemotePost[]> {
  const { login, book } = yuqueParts(site.repo);
  const response = await platformFetch(
    `https://www.yuque.com/api/v2/repos/${encodeURIComponent(login)}/${encodeURIComponent(book)}/docs`,
    { headers: { "X-Auth-Token": site.token.trim(), Accept: "application/json" } },
  );
  if (!response.ok) throw httpError("语雀", response.status, await errorText(response));
  const data = (await response.json()) as { data?: { id?: number; title?: string; slug?: string }[] };
  return (data.data ?? [])
    .map((doc) => ({
      remoteId: doc.id != null ? String(doc.id) : "",
      title: doc.title || "未命名",
      url: `https://www.yuque.com/${login}/${book}/${doc.slug || ""}`,
      hint: "语雀",
    }))
    .filter((doc) => doc.remoteId);
}

async function readYuque(site: YuqueSite, remoteId: string): Promise<RemotePostFile> {
  const { login, book } = yuqueParts(site.repo);
  const response = await platformFetch(
    `https://www.yuque.com/api/v2/repos/${encodeURIComponent(login)}/${encodeURIComponent(book)}/docs/${encodeURIComponent(remoteId)}`,
    { headers: { "X-Auth-Token": site.token.trim(), Accept: "application/json" } },
  );
  if (!response.ok) throw httpError("语雀", response.status, await errorText(response));
  const data = (await response.json()) as { data?: { id?: number; title?: string; slug?: string; body?: string } };
  const doc = data.data;
  if (!doc) throw new Error("语雀没有这篇文章");
  const title = doc.title || "未命名";
  return {
    remoteId: doc.id != null ? String(doc.id) : remoteId,
    title,
    url: `https://www.yuque.com/${login}/${book}/${doc.slug || ""}`,
    hint: "语雀",
    content: asMarkdown(title, doc.body || ""),
  };
}
