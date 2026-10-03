import { desktopRequest, isDesktopApp } from "./desktop.ts";
import { firstLineTitle } from "./format.ts";
import { renderMarkdown } from "./markdown.ts";
import { postSlug, publishNoteToBlog, stripMatchingHeading, testBlogConfig } from "./blog-publish.ts";
import type { BlogConfig } from "./blog-config.ts";
import type { Note } from "./types.ts";
import {
  ghostAdminToken,
  platformLabel,
  rememberTarget,
  siteBase,
  stripFrontMatterBlock,
  targetFor,
  xmlRpcCall,
  xmlRpcFault,
  xmlRpcString,
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

export function articleFromNote(content: string): { title: string; markdown: string; html: string } {
  const source = stripFrontMatterBlock(content);
  const title = firstLineTitle(source);
  const markdown = stripMatchingHeading(source, title).replace(/^\s+/, "");
  const html = renderMarkdown(markdown || source);
  return { title, markdown, html };
}

function assertArticle(content: string): { title: string; markdown: string; html: string } {
  const article = articleFromNote(content);
  if (article.title === "未命名笔记" && !content.trim()) throw new Error("这篇还没有内容");
  return article;
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
  const article = assertArticle(content);
  const base = siteBase(site.site);
  const previous = targetFor(noteId, "wordpress");
  const path = previous
    ? `${base}/wp-json/wp/v2/posts/${encodeURIComponent(previous.remoteId)}`
    : `${base}/wp-json/wp/v2/posts`;
  const response = await platformFetch(path, {
    method: previous ? "POST" : "POST",
    headers: {
      Authorization: basicAuth(site.username, site.password),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      title: article.title,
      content: article.html,
      status: site.status,
      slug: postSlug(article.title),
    }),
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
  const article = assertArticle(content);
  const body = article.markdown || article.title;
  const struct = `<struct><member><name>title</name><value>${xmlString(article.title)}</value></member><member><name>description</name><value>${xmlString(body)}</value></member></struct>`;
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
  const article = assertArticle(content);
  const base = siteBase(site.site);
  const previous = targetFor(noteId, "halo");
  const markdown = `# ${article.title}\n\n${article.markdown}`.trim();
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
          cover: "",
          deleted: false,
          publish: site.publish,
          pinned: false,
          allowComment: true,
          visible: "PUBLIC",
          priority: 0,
          excerpt: { autoGenerate: true, raw: "" },
          categories: [],
          tags: [],
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
  const article = assertArticle(content);
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
  const post: Record<string, string> = {
    title: article.title,
    html: article.html || `<p>${article.title}</p>`,
    status: site.status,
  };
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
  const article = assertArticle(content);
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
      body: article.markdown || article.title,
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
