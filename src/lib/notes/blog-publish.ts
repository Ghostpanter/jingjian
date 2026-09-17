import { utf8, uint8ToBase64, base64ToBytes } from "./bytes.ts";
import {
  isBlogConfigured,
  noteIdForPublishedPath,
  publishedPathFor,
  readBlogConfig,
  rememberPublished,
  type BlogConfig,
  type BlogEngine,
  type BlogHost,
} from "./blog-config.ts";
import { desktopRequest, isDesktopApp } from "./desktop.ts";
import { firstLineTitle } from "./format.ts";
import { stableIncomingId } from "./open-incoming.ts";
import type { Note } from "./types.ts";

export function githubParts(repo: string): { owner: string; name: string } {
  const cleaned = repo
    .trim()
    .replace(/^https?:\/\/(github|gitee)\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/g, "");
  const [owner, name] = cleaned.split("/").map((part) => part.trim()).filter(Boolean);
  if (!owner || !name) throw new Error("仓库写成 owner/repo");
  return { owner, name };
}

export function postSlug(title: string): string {
  const slug = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return slug || "post";
}

export function localDateStamp(now = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localDateTime(now = new Date()): { iso: string; hexo: string } {
  const stamp = localDateStamp(now);
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const tz = `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
  return {
    iso: `${stamp}T${hours}:${minutes}:${seconds}${tz}`,
    hexo: `${stamp} ${hours}:${minutes}:${seconds}`,
  };
}

export function joinRepoPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

export function defaultPostPath(title: string, postsDir: string, now = new Date()): string {
  return joinRepoPath(postsDir, `${localDateStamp(now)}-${postSlug(title)}.md`);
}

export function encodeContentPath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

export function choosePostPath(options: {
  title: string;
  postsDir: string;
  noteId: string;
  remembered: string | null;
  remoteExists: boolean;
  now?: Date;
}): { path: string; useSha: boolean } {
  const now = options.now ?? new Date();
  if (options.remembered) {
    return { path: options.remembered, useSha: options.remoteExists };
  }
  const primary = defaultPostPath(options.title, options.postsDir, now);
  if (!options.remoteExists) return { path: primary, useSha: false };
  const short = options.noteId.replace(/-/g, "").slice(0, 8);
  return {
    path: joinRepoPath(options.postsDir, `${localDateStamp(now)}-${postSlug(options.title)}-${short}.md`),
    useSha: false,
  };
}

export function stripMatchingHeading(content: string, title: string): string {
  const trimmed = content.replace(/^\uFEFF/, "");
  const first = trimmed.match(/^.*$/m)?.[0] ?? "";
  const heading = first.replace(/^#{1,6}\s+/, "").trim();
  if (heading !== title) return trimmed.replace(/^\s+/, "");
  return trimmed.slice(first.length).replace(/^\r?\n+/, "");
}

export function yamlQuote(value: string): string {
  return JSON.stringify(value);
}

export function folderCategory(folder?: string): string | null {
  const name = folder?.split("/").filter(Boolean).pop()?.trim();
  return name || null;
}

export function hasFrontMatter(content: string): boolean {
  return /^---\r?\n/.test(content);
}

export function extraFrontMatterLines(raw: string): string[] {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && line.trim() !== "---");
}

export function buildFrontMatter(
  engine: BlogEngine,
  title: string,
  category: string | null,
  now = new Date(),
  extra = "",
): string {
  const time = localDateTime(now);
  const lines = ["---", `title: ${yamlQuote(title)}`];
  if (engine === "hexo") {
    lines.push(`date: ${time.hexo}`);
    if (category) {
      lines.push("categories:", `  - ${yamlQuote(category)}`);
    }
  } else {
    lines.push(`date: ${time.iso}`, "draft: false");
    if (category) lines.push(`categories: [${yamlQuote(category)}]`);
  }
  lines.push(...extraFrontMatterLines(extra));
  lines.push("---", "");
  return lines.join("\n");
}

export function buildPostFile(
  note: Note,
  engine: BlogEngine,
  now = new Date(),
  extra = "",
): string {
  if (hasFrontMatter(note.content)) return note.content.replace(/^\uFEFF/, "");
  const title = firstLineTitle(note.content);
  const body = stripMatchingHeading(note.content, title);
  return `${buildFrontMatter(engine, title, folderCategory(note.folder), now, extra)}${body.replace(/^\uFEFF/, "")}`;
}

function hostName(host: BlogHost): string {
  return host === "gitee" ? "Gitee" : "GitHub";
}

async function contentsFetch(
  config: BlogConfig,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { owner, name } = githubParts(config.repo);
  const token = config.token.trim();
  const host = config.host === "gitee" ? "gitee" : "github";
  if (host === "gitee") {
    const url = path.startsWith("http")
      ? path
      : `https://gitee.com/api/v5${path}${path.includes("?") ? "&" : "?"}access_token=${encodeURIComponent(token)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...(init.headers as Record<string, string> | undefined),
    };
    if (isDesktopApp()) {
      headers["User-Agent"] = "jingjian";
      return desktopRequest(url, { ...init, headers });
    }
    return fetch(url, { ...init, headers });
  }
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (isDesktopApp()) {
    headers["User-Agent"] = "jingjian";
    return desktopRequest(url, { ...init, headers });
  }
  return fetch(url, { ...init, headers });
}

async function readApiMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message?.trim() || "";
  } catch {
    return "";
  }
}

function hostError(host: BlogHost, status: number, message: string): Error {
  const name = hostName(host);
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("bad credentials") || lower.includes("unauthorized")) {
    return new Error("Token 无效");
  }
  if (status === 403 && /rate limit/i.test(message)) {
    return new Error(`${name} 次数用完，稍后再发`);
  }
  if (status === 403 && /resource not accessible|must have|403/i.test(message)) {
    return new Error("Token 需要 contents 写入权限");
  }
  if (status === 404) {
    return new Error("仓库不存在，或 Token 没有权限");
  }
  return new Error(message ? `${name}：${message}` : `${name} 失败（${status}）`);
}

export async function testBlogConfig(config: BlogConfig): Promise<string> {
  if (!config.token.trim()) throw new Error("请填写 Token");
  const { owner, name } = githubParts(config.repo);
  const response = await contentsFetch(config, `/repos/${owner}/${name}`);
  if (!response.ok) throw hostError(config.host, response.status, await readApiMessage(response));
  const dir = config.postsDir.trim() || (config.engine === "hexo" ? "source/_posts" : "content/posts");
  return `已连接 ${hostName(config.host)} ${owner}/${name}，文章写入 ${dir}`;
}

export type PublishResult = {
  path: string;
  url: string;
  updated: boolean;
};

export async function publishNoteToBlog(
  note: Note,
  config: BlogConfig = readBlogConfig(),
): Promise<PublishResult> {
  if (!isBlogConfigured(config)) throw new Error("先在设置里填写博客仓库");
  const title = firstLineTitle(note.content);
  if (title === "未命名笔记" && !note.content.trim()) throw new Error("这篇还没有内容");
  const markdown = buildPostFile(note, config.engine, new Date(), config.extraFrontMatter);
  if (utf8(markdown).byteLength > 900_000) throw new Error("文章过大，接口装不下");

  const { owner, name } = githubParts(config.repo);
  const branch = config.branch.trim() || "main";
  const remembered = publishedPathFor(note.id);
  const probePath = remembered || defaultPostPath(title, config.postsDir);
  const existing = await contentsFetch(
    config,
    `/repos/${owner}/${name}/contents/${encodeContentPath(probePath)}?ref=${encodeURIComponent(branch)}`,
  );
  if (!existing.ok && existing.status !== 404) {
    throw hostError(config.host, existing.status, await readApiMessage(existing));
  }
  const chosen = choosePostPath({
    title,
    postsDir: config.postsDir,
    noteId: note.id,
    remembered,
    remoteExists: existing.ok,
  });
  let sha: string | undefined;
  if (chosen.useSha && existing.ok) {
    const payload = (await existing.json()) as { sha?: string };
    sha = payload.sha;
  } else {
    void existing.text();
  }

  const body: Record<string, string> = {
    message: sha ? `静笺: 更新 ${title}` : `静笺: 发布 ${title}`,
    content: uint8ToBase64(utf8(markdown)),
    branch,
  };
  if (sha) body.sha = sha;
  if (config.host === "gitee") body.access_token = config.token.trim();

  const response = await contentsFetch(
    config,
    `/repos/${owner}/${name}/contents/${encodeContentPath(chosen.path)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw hostError(config.host, response.status, await readApiMessage(response));
  const payload = (await response.json()) as {
    content?: { html_url?: string; path?: string };
    html_url?: string;
  };
  rememberPublished(note.id, chosen.path);
  const site = config.host === "gitee" ? "gitee.com" : "github.com";
  return {
    path: payload.content?.path || chosen.path,
    url:
      payload.content?.html_url ||
      payload.html_url ||
      `https://${site}/${owner}/${name}/blob/${branch}/${chosen.path}`,
    updated: Boolean(sha),
  };
}

const POST_NAME = /\.(md|markdown|mdx)$/i;
const MAX_POSTS = 250;
const MAX_DIR_DEPTH = 4;

export type RepoEntry = {
  name: string;
  path: string;
  type: "file" | "dir";
  sha?: string;
  size?: number;
};

export type BlogPostItem = {
  name: string;
  path: string;
  sha?: string;
  size?: number;
};

export type BlogPostFile = BlogPostItem & { content: string };

export function isPostFilename(name: string): boolean {
  const base = name.trim();
  if (!base || base.startsWith(".")) return false;
  if (base.toLowerCase() === "_index.md") return false;
  return POST_NAME.test(base);
}

export function titleFromPostName(path: string): string {
  const parts = path.split("/").filter(Boolean);
  const base = parts[parts.length - 1] || path;
  const stem = base.replace(POST_NAME, "");
  if (/^index$/i.test(stem)) {
    const parent = parts[parts.length - 2] || stem;
    return parent.replace(/^\d{4}-\d{2}-\d{2}-/, "").replace(/-/g, " ").trim() || parent;
  }
  const stripped = stem.replace(/^\d{4}-\d{2}-\d{2}-/, "");
  return stripped.replace(/-/g, " ").trim() || stem;
}

export function titleFromPostContent(content: string, fallback: string): string {
  const title = firstLineTitle(content);
  return title === "未命名笔记" ? fallback : title;
}

export function decodeGitContent(content: string | undefined, encoding?: string): string {
  const raw = (content || "").replace(/\s+/g, "");
  if (!raw) return "";
  if (encoding && encoding !== "base64") return content || "";
  try {
    return new TextDecoder("utf-8").decode(base64ToBytes(raw));
  } catch {
    return "";
  }
}

export function blogNoteId(host: BlogHost, repo: string, path: string): string {
  const { owner, name } = githubParts(repo);
  return stableIncomingId(`blog:${host}:${owner}/${name}:${path}`);
}

export function localIdForBlogPost(
  path: string,
  host: BlogHost,
  repo: string,
  hasNote: (id: string) => boolean,
): string | null {
  const remembered = noteIdForPublishedPath(path);
  if (remembered && hasNote(remembered)) return remembered;
  try {
    const generated = blogNoteId(host, repo, path);
    if (hasNote(generated)) return generated;
  } catch {
    return null;
  }
  return null;
}

export function normalizeRepoEntries(payload: unknown): RepoEntry[] {
  const list = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  const out: RepoEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const name = typeof rec.name === "string" ? rec.name : "";
    const path = typeof rec.path === "string" ? rec.path : name;
    const type = rec.type === "dir" ? "dir" : rec.type === "file" ? "file" : "";
    if (!name || !type) continue;
    out.push({
      name,
      path,
      type,
      sha: typeof rec.sha === "string" ? rec.sha : undefined,
      size: typeof rec.size === "number" ? rec.size : undefined,
    });
  }
  return out;
}

export function collectDirectPosts(entries: RepoEntry[]): {
  files: BlogPostItem[];
  dirs: string[];
} {
  const files: BlogPostItem[] = [];
  const dirs: string[] = [];
  for (const entry of entries) {
    if (entry.type === "file" && isPostFilename(entry.name)) {
      files.push({ name: entry.name, path: entry.path, sha: entry.sha, size: entry.size });
    } else if (entry.type === "dir" && entry.name && !entry.name.startsWith(".")) {
      dirs.push(entry.path);
    }
  }
  return { files, dirs };
}

function contentsUrl(config: BlogConfig, repoPath: string): string {
  const { owner, name } = githubParts(config.repo);
  const branch = config.branch.trim() || "main";
  const dir = repoPath.replace(/^\/+|\/+$/g, "");
  const encoded = dir ? `/${encodeContentPath(dir)}` : "";
  return `/repos/${owner}/${name}/contents${encoded}?ref=${encodeURIComponent(branch)}`;
}

async function listDir(
  config: BlogConfig,
  repoPath: string,
  depth: number,
  acc: BlogPostItem[],
): Promise<void> {
  if (depth > MAX_DIR_DEPTH || acc.length >= MAX_POSTS) return;
  const response = await contentsFetch(config, contentsUrl(config, repoPath));
  if (!response.ok) {
    if (response.status === 404 && depth === 0) {
      throw new Error("找不到文章目录，检查设置里的路径");
    }
    throw hostError(config.host, response.status, await readApiMessage(response));
  }
  const payload: unknown = await response.json();
  const { files, dirs } = collectDirectPosts(normalizeRepoEntries(payload));
  for (const file of files) {
    if (acc.length >= MAX_POSTS) return;
    acc.push(file);
  }
  for (const dir of dirs) {
    if (acc.length >= MAX_POSTS) return;
    await listDir(config, dir, depth + 1, acc);
  }
}

export async function listBlogPosts(
  config: BlogConfig = readBlogConfig(),
): Promise<BlogPostItem[]> {
  if (!isBlogConfigured(config)) throw new Error("先在设置里填写博客仓库");
  const dir = config.postsDir.trim().replace(/^\/+|\/+$/g, "");
  const acc: BlogPostItem[] = [];
  await listDir(config, dir, 0, acc);
  acc.sort((a, b) => b.path.localeCompare(a.path, "zh-CN"));
  return acc.slice(0, MAX_POSTS);
}

export async function readBlogPost(
  path: string,
  config: BlogConfig = readBlogConfig(),
): Promise<BlogPostFile> {
  if (!isBlogConfigured(config)) throw new Error("先在设置里填写博客仓库");
  const response = await contentsFetch(config, contentsUrl(config, path));
  if (!response.ok) throw hostError(config.host, response.status, await readApiMessage(response));
  const payload: unknown = await response.json();
  if (Array.isArray(payload)) throw new Error("这是文件夹，不是文章");
  const rec = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const encoding = typeof rec.encoding === "string" ? rec.encoding : undefined;
  const truncated = rec.truncated === true;
  const content = decodeGitContent(
    typeof rec.content === "string" ? rec.content : undefined,
    encoding,
  );
  if ((truncated || encoding === "none") && !content) {
    throw new Error("文章过大，无法拉取");
  }
  const name = typeof rec.name === "string" ? rec.name : path.split("/").pop() || path;
  return {
    name,
    path: typeof rec.path === "string" ? rec.path : path,
    sha: typeof rec.sha === "string" ? rec.sha : undefined,
    size: typeof rec.size === "number" ? rec.size : undefined,
    content,
  };
}
