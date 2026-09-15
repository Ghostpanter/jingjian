import { utf8, uint8ToBase64 } from "./bytes.ts";
import {
  isBlogConfigured,
  publishedPathFor,
  readBlogConfig,
  rememberPublished,
  type BlogConfig,
  type BlogEngine,
} from "./blog-config.ts";
import { desktopRequest, isDesktopApp } from "./desktop.ts";
import { firstLineTitle } from "./format.ts";
import type { Note } from "./types.ts";

export function githubParts(repo: string): { owner: string; name: string } {
  const cleaned = repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
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

export function buildFrontMatter(
  engine: BlogEngine,
  title: string,
  category: string | null,
  now = new Date(),
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
  lines.push("---", "");
  return lines.join("\n");
}

export function buildPostFile(note: Note, engine: BlogEngine, now = new Date()): string {
  const title = firstLineTitle(note.content);
  const body = stripMatchingHeading(note.content, title);
  return `${buildFrontMatter(engine, title, folderCategory(note.folder), now)}${body.replace(/^\uFEFF/, "")}`;
}

async function githubFetch(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = path.startsWith("http") ? path : `https://api.github.com${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token.trim()}`,
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

async function readGithubMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string };
    return payload.message?.trim() || "";
  } catch {
    return "";
  }
}

function githubError(status: number, message: string): Error {
  const lower = message.toLowerCase();
  if (status === 401 || lower.includes("bad credentials")) {
    return new Error("Token 无效");
  }
  if (status === 403 && /rate limit/i.test(message)) {
    return new Error("GitHub 次数用完，稍后再发");
  }
  if (status === 403 && /resource not accessible|must have/i.test(message)) {
    return new Error("Token 需要 contents 写入权限");
  }
  if (status === 404) {
    return new Error("仓库不存在，或 Token 没有权限");
  }
  return new Error(message ? `GitHub：${message}` : `GitHub 失败（${status}）`);
}

export async function testBlogConfig(config: BlogConfig): Promise<string> {
  if (!config.token.trim()) throw new Error("请填写 GitHub Token");
  const { owner, name } = githubParts(config.repo);
  const response = await githubFetch(`/repos/${owner}/${name}`, config.token);
  if (!response.ok) throw githubError(response.status, await readGithubMessage(response));
  const dir = config.postsDir.trim() || (config.engine === "hexo" ? "source/_posts" : "content/posts");
  return `已连接 ${owner}/${name}，文章写入 ${dir}`;
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
  const markdown = buildPostFile(note, config.engine);
  if (utf8(markdown).byteLength > 900_000) throw new Error("文章过大，GitHub 接口装不下");

  const { owner, name } = githubParts(config.repo);
  const branch = config.branch.trim() || "main";
  const remembered = publishedPathFor(note.id);
  const probePath = remembered || defaultPostPath(title, config.postsDir);
  const existing = await githubFetch(
    `/repos/${owner}/${name}/contents/${encodeContentPath(probePath)}?ref=${encodeURIComponent(branch)}`,
    config.token,
  );
  if (!existing.ok && existing.status !== 404) {
    throw githubError(existing.status, await readGithubMessage(existing));
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

  const response = await githubFetch(
    `/repos/${owner}/${name}/contents/${encodeContentPath(chosen.path)}`,
    config.token,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: sha ? `静笺: 更新 ${title}` : `静笺: 发布 ${title}`,
        content: uint8ToBase64(utf8(markdown)),
        branch,
        ...(sha ? { sha } : {}),
      }),
    },
  );
  if (!response.ok) throw githubError(response.status, await readGithubMessage(response));
  const payload = (await response.json()) as {
    content?: { html_url?: string; path?: string };
  };
  rememberPublished(note.id, chosen.path);
  return {
    path: payload.content?.path || chosen.path,
    url:
      payload.content?.html_url ||
      `https://github.com/${owner}/${name}/blob/${branch}/${chosen.path}`,
    updated: Boolean(sha),
  };
}
