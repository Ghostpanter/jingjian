export type BlogEngine = "hugo" | "hexo";
export type BlogHost = "github" | "gitee";

export type BlogConfig = {
  token: string;
  repo: string;
  branch: string;
  engine: BlogEngine;
  postsDir: string;
  host: BlogHost;
  extraFrontMatter: string;
};

const STORAGE_KEY = "jingjian.blog.v1";
const PUBLISHED_KEY = "jingjian.blog.published.v1";

export const DEFAULT_BLOG_CONFIG: BlogConfig = {
  token: "",
  repo: "",
  branch: "main",
  engine: "hugo",
  postsDir: "content/posts",
  host: "github",
  extraFrontMatter: "",
};

export const ENGINE_POSTS_DIR: Record<BlogEngine, string> = {
  hugo: "content/posts",
  hexo: "source/_posts",
};

const ENGINES: BlogEngine[] = ["hugo", "hexo"];
const HOSTS: BlogHost[] = ["github", "gitee"];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export function postsDirFor(engine: BlogEngine, current?: string): string {
  const trimmed = (current ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (!trimmed) return ENGINE_POSTS_DIR[engine];
  const other = engine === "hugo" ? ENGINE_POSTS_DIR.hexo : ENGINE_POSTS_DIR.hugo;
  if (trimmed === other) return ENGINE_POSTS_DIR[engine];
  return trimmed;
}

export function readBlogConfig(): BlogConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BLOG_CONFIG };
    const parsed = asRecord(JSON.parse(raw));
    if (!parsed) return { ...DEFAULT_BLOG_CONFIG };
    const engine = ENGINES.includes(parsed.engine as BlogEngine)
      ? (parsed.engine as BlogEngine)
      : "hugo";
    const host = HOSTS.includes(parsed.host as BlogHost) ? (parsed.host as BlogHost) : "github";
    return {
      token: str(parsed.token, ""),
      repo: str(parsed.repo, ""),
      branch: str(parsed.branch, "main") || "main",
      engine,
      postsDir: postsDirFor(engine, str(parsed.postsDir, "")),
      host,
      extraFrontMatter: str(parsed.extraFrontMatter, ""),
    };
  } catch {
    return { ...DEFAULT_BLOG_CONFIG };
  }
}

export function writeBlogConfig(config: BlogConfig) {
  const engine = ENGINES.includes(config.engine) ? config.engine : "hugo";
  const host = HOSTS.includes(config.host) ? config.host : "github";
  const next: BlogConfig = {
    token: config.token.trim(),
    repo: config.repo.trim(),
    branch: config.branch.trim() || "main",
    engine,
    postsDir: postsDirFor(engine, config.postsDir),
    host,
    extraFrontMatter: config.extraFrontMatter.replace(/\r\n/g, "\n").trim(),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode
  }
}

export const BLOG_FOLDER = "博客";

export function isBlogConfigured(config: BlogConfig = readBlogConfig()): boolean {
  return Boolean(config.token.trim() && config.repo.trim());
}

export type PublishedPost = {
  path: string;
  at: number;
};

export function readPublishedMap(): Record<string, PublishedPost> {
  try {
    const raw = localStorage.getItem(PUBLISHED_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, PublishedPost>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function publishedPathFor(noteId: string): string | null {
  return readPublishedMap()[noteId]?.path ?? null;
}

export function noteIdForPublishedPath(path: string): string | null {
  const target = path.trim();
  if (!target) return null;
  for (const [id, post] of Object.entries(readPublishedMap())) {
    if (post?.path === target) return id;
  }
  return null;
}

export function rememberPublished(noteId: string, path: string) {
  try {
    const map = readPublishedMap();
    const target = path.trim();
    for (const [id, post] of Object.entries(map)) {
      if (id !== noteId && post?.path === target) delete map[id];
    }
    map[noteId] = { path: target, at: Date.now() };
    localStorage.setItem(PUBLISHED_KEY, JSON.stringify(map));
  } catch {
    // private mode
  }
}
