import { utf8, uint8ToBase64 } from "./bytes.ts";
import {
  isBlogConfigured,
  publishedPathFor,
  readBlogConfig,
  rememberPublished,
  type BlogConfig,
  type BlogEngine,
  type BlogHost,
} from "./blog-config.ts";
import { desktopRequest, isDesktopApp } from "./desktop.ts";
import { firstLineTitle } from "./format.ts";
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
