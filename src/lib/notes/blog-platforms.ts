import { toArrayBuffer, utf8 } from "./bytes.ts";
import type { BlogConfig } from "./blog-config.ts";

export const BLOG_PLATFORM_IDS = ["git", "wordpress", "typecho", "halo", "ghost", "yuque"] as const;

export type PlatformId = (typeof BLOG_PLATFORM_IDS)[number];

export const BLOG_PLATFORMS: { id: PlatformId; label: string; hint: string }[] = [
  { id: "git", label: "静态博客", hint: "Hugo / Hexo，GitHub 或 Gitee" },
  { id: "wordpress", label: "WordPress", hint: "用应用密码，不是登录密码" },
  { id: "typecho", label: "Typecho", hint: "站点用户名和密码" },
  { id: "halo", label: "Halo", hint: "个人令牌" },
  { id: "ghost", label: "Ghost", hint: "Admin API 密钥，写成 id:secret" },
  { id: "yuque", label: "语雀", hint: "知识库写成 用户名/知识库" },
];

export type WordPressSite = {
  enabled: boolean;
  site: string;
  username: string;
  password: string;
  status: "publish" | "draft";
  category: string;
  tags: string;
  cover: string;
};

export type TypechoSite = {
  enabled: boolean;
  site: string;
  username: string;
  password: string;
  publish: boolean;
  category: string;
  tags: string;
  cover: string;
};

export type HaloSite = {
  enabled: boolean;
  site: string;
  token: string;
  publish: boolean;
  category: string;
  tags: string;
  cover: string;
};

export type GhostSite = {
  enabled: boolean;
  site: string;
  adminKey: string;
  status: "published" | "draft";
  category: string;
  tags: string;
  cover: string;
};

export type YuqueSite = {
  enabled: boolean;
  token: string;
  repo: string;
  public: boolean;
  category: string;
  tags: string;
  cover: string;
};

export type PlatformPrefs = {
  selected: PlatformId;
  defaultsSet: boolean;
  defaults: PlatformId[];
  gitEnabled: boolean | null;
  wordpress: WordPressSite;
  typecho: TypechoSite;
  halo: HaloSite;
  ghost: GhostSite;
  yuque: YuqueSite;
};

export type TargetRecord = { remoteId: string; url: string; at: number };

const PREFS_KEY = "jingjian.blog.platforms.v1";
const TARGETS_KEY = "jingjian.blog.targets.v1";

export const EMPTY_WORDPRESS: WordPressSite = {
  enabled: false,
  site: "",
  username: "",
  password: "",
  status: "publish",
  category: "",
  tags: "",
  cover: "",
};

export const EMPTY_TYPECHO: TypechoSite = {
  enabled: false,
  site: "",
  username: "",
  password: "",
  publish: true,
  category: "",
  tags: "",
  cover: "",
};

export const EMPTY_HALO: HaloSite = {
  enabled: false,
  site: "",
  token: "",
  publish: true,
  category: "",
  tags: "",
  cover: "",
};

export const EMPTY_GHOST: GhostSite = {
  enabled: false,
  site: "",
  adminKey: "",
  status: "published",
  category: "",
  tags: "",
  cover: "",
};

export const EMPTY_YUQUE: YuqueSite = {
  enabled: false,
  token: "",
  repo: "",
  public: true,
  category: "",
  tags: "",
  cover: "",
};

function emptyPrefs(): PlatformPrefs {
  return {
    selected: "git",
    defaultsSet: false,
    defaults: [],
    gitEnabled: null,
    wordpress: { ...EMPTY_WORDPRESS },
    typecho: { ...EMPTY_TYPECHO },
    halo: { ...EMPTY_HALO },
    ghost: { ...EMPTY_GHOST },
    yuque: { ...EMPTY_YUQUE },
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function platformId(value: unknown): PlatformId | null {
  return BLOG_PLATFORM_IDS.includes(value as PlatformId) ? (value as PlatformId) : null;
}

export function siteBase(input: string): string {
  let raw = input.trim();
  if (!raw) throw new Error("请填写站点地址");
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("站点地址不对");
  }
  let path = url.pathname.replace(/\/+$/, "");
  path = path
    .replace(/\/wp-admin$/i, "")
    .replace(/\/wp-login\.php$/i, "")
    .replace(/\/xmlrpc\.php$/i, "")
    .replace(/\/index\.php\/action\/xmlrpc$/i, "")
    .replace(/\/action\/xmlrpc$/i, "")
    .replace(/\/index\.php$/i, "");
  return `${url.origin}${path}`;
}

export function yuqueParts(repo: string): { login: string; book: string } {
  const cleaned = repo
    .trim()
    .replace(/^https?:\/\/(?:www\.)?yuque\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
  const [login, book] = cleaned.split("/").map((part) => part.trim()).filter(Boolean);
  if (!login || !book) throw new Error("知识库写成 用户名/知识库");
  return { login, book };
}

export function normalizePlatformPrefs(value: unknown): PlatformPrefs {
  const base = emptyPrefs();
  const parsed = asRecord(value);
  if (!parsed) return base;
  const selected = platformId(parsed.selected) ?? "git";
  const defaults = Array.isArray(parsed.defaults)
    ? parsed.defaults.map(platformId).filter((id): id is PlatformId => id != null)
    : [];
  const wordpress = asRecord(parsed.wordpress);
  const typecho = asRecord(parsed.typecho);
  const halo = asRecord(parsed.halo);
  const ghost = asRecord(parsed.ghost);
  const yuque = asRecord(parsed.yuque);
  return {
    selected,
    defaultsSet: parsed.defaultsSet === true,
    defaults,
    gitEnabled: typeof parsed.gitEnabled === "boolean" ? parsed.gitEnabled : null,
    wordpress: {
      enabled: flag(wordpress?.enabled, false),
      site: str(wordpress?.site),
      username: str(wordpress?.username),
      password: str(wordpress?.password),
      status: wordpress?.status === "draft" ? "draft" : "publish",
      category: str(wordpress?.category),
      tags: str(wordpress?.tags),
      cover: str(wordpress?.cover),
    },
    typecho: {
      enabled: flag(typecho?.enabled, false),
      site: str(typecho?.site),
      username: str(typecho?.username),
      password: str(typecho?.password),
      publish: flag(typecho?.publish, true),
      category: str(typecho?.category),
      tags: str(typecho?.tags),
      cover: str(typecho?.cover),
    },
    halo: {
      enabled: flag(halo?.enabled, false),
      site: str(halo?.site),
      token: str(halo?.token),
      publish: flag(halo?.publish, true),
      category: str(halo?.category),
      tags: str(halo?.tags),
      cover: str(halo?.cover),
    },
    ghost: {
      enabled: flag(ghost?.enabled, false),
      site: str(ghost?.site),
      adminKey: str(ghost?.adminKey),
      status: ghost?.status === "draft" ? "draft" : "published",
      category: str(ghost?.category),
      tags: str(ghost?.tags),
      cover: str(ghost?.cover),
    },
    yuque: {
      enabled: flag(yuque?.enabled, false),
      token: str(yuque?.token),
      repo: str(yuque?.repo),
      public: flag(yuque?.public, true),
      category: str(yuque?.category),
      tags: str(yuque?.tags),
      cover: str(yuque?.cover),
    },
  };
}

export function readPlatformPrefs(): PlatformPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return emptyPrefs();
    return normalizePlatformPrefs(JSON.parse(raw) as unknown);
  } catch {
    return emptyPrefs();
  }
}

export function writePlatformPrefs(prefs: PlatformPrefs) {
  const next = normalizePlatformPrefs(prefs);
  next.defaultsSet = prefs.defaultsSet;
  next.defaults = next.defaults.filter((id) => platformEnabled(next, id, true));
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // private mode
  }
}

export function gitReady(config: Pick<BlogConfig, "token" | "repo">): boolean {
  return Boolean(config.token.trim() && config.repo.trim());
}

export function platformEnabled(prefs: PlatformPrefs, id: PlatformId, gitConfigured: boolean): boolean {
  if (id === "git") return prefs.gitEnabled ?? gitConfigured;
  return prefs[id].enabled;
}

export function platformReady(prefs: PlatformPrefs, id: PlatformId, config: Pick<BlogConfig, "token" | "repo">): boolean {
  if (id === "git") return gitReady(config);
  if (id === "wordpress") {
    return Boolean(prefs.wordpress.site.trim() && prefs.wordpress.username.trim() && prefs.wordpress.password.trim());
  }
  if (id === "typecho") {
    return Boolean(prefs.typecho.site.trim() && prefs.typecho.username.trim() && prefs.typecho.password.trim());
  }
  if (id === "halo") return Boolean(prefs.halo.site.trim() && prefs.halo.token.trim());
  if (id === "ghost") return prefs.ghost.site.trim() !== "" && prefs.ghost.adminKey.includes(":");
  return Boolean(prefs.yuque.token.trim() && prefs.yuque.repo.includes("/"));
}

export function platformLabel(id: PlatformId): string {
  return BLOG_PLATFORMS.find((item) => item.id === id)?.label ?? id;
}

export type PublishPlan =
  | { mode: "now"; ids: PlatformId[] }
  | { mode: "choose"; ids: PlatformId[] }
  | { mode: "settings" };

export function publishPlan(prefs: PlatformPrefs, config: Pick<BlogConfig, "token" | "repo">): PublishPlan {
  const readyGit = gitReady(config);
  const enabled = BLOG_PLATFORM_IDS.filter((id) => platformEnabled(prefs, id, readyGit));
  const ready = enabled.filter((id) => platformReady(prefs, id, config));
  if (!prefs.defaultsSet) {
    if (readyGit && platformEnabled(prefs, "git", readyGit)) return { mode: "now", ids: ["git"] };
    return enabled.length ? { mode: "choose", ids: enabled } : { mode: "settings" };
  }
  const chosen = prefs.defaults.filter((id) => ready.includes(id));
  if (chosen.length) return { mode: "now", ids: chosen };
  return enabled.length ? { mode: "choose", ids: enabled } : { mode: "settings" };
}

export function canTestPlatform(prefs: PlatformPrefs, config: Pick<BlogConfig, "token" | "repo">): boolean {
  return platformReady(prefs, prefs.selected, config);
}

export function stripFrontMatterBlock(content: string): string {
  const text = content.replace(/^\uFEFF/, "");
  if (!/^---\r?\n/.test(text)) return text;
  const match = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(text);
  if (!match) return text;
  return text.slice(match[0].length).replace(/^\r?\n/, "");
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function xmlRpcCall(method: string, params: string[]): string {
  const inner = params
    .map((param) => `<param><value>${param}</value></param>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>${method}</methodName><params>${inner}</params></methodCall>`;
}

export function xmlString(value: string): string {
  return `<string>${xmlEscape(value)}</string>`;
}

export function xmlRpcFault(xml: string): string | null {
  if (!xml.includes("<fault>")) return null;
  const match = /<name>faultString<\/name>\s*<value>(?:<string>)?([\s\S]*?)(?:<\/string>)?<\/value>/.exec(xml);
  return decodeXml(match?.[1]?.trim() || "站点拒绝了这次发布");
}

export function metaList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function xmlRpcStructs(xml: string): Record<string, string>[] {
  const structs: Record<string, string>[] = [];
  const structRe = /<struct>([\s\S]*?)<\/struct>/g;
  let match: RegExpExecArray | null;
  while ((match = structRe.exec(xml))) {
    const record: Record<string, string> = {};
    const memberRe = /<name>([\s\S]*?)<\/name>\s*<value>([\s\S]*?)<\/value>/g;
    let member: RegExpExecArray | null;
    while ((member = memberRe.exec(match[1]))) {
      const name = decodeXml(member[1].trim());
      const inner = member[2].replace(/<\/?(?:string|int|i4|boolean|double|dateTime\.iso8601|base64)>/g, "");
      record[name] = decodeXml(inner.trim());
    }
    if (Object.keys(record).length) structs.push(record);
  }
  return structs;
}

export function xmlRpcString(xml: string): string | null {
  const match = /<string>([\s\S]*?)<\/string>/.exec(xml);
  return match ? decodeXml(match[1].trim()) : null;
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function bytesToB64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.trim();
  if (!clean || clean.length % 2 !== 0 || /[^0-9a-fA-F]/.test(clean)) {
    throw new Error("Ghost 密钥写成 id:secret");
  }
  const out = new Uint8Array(clean.length / 2);
  for (let index = 0; index < out.length; index += 1) {
    out[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return out;
}

export async function ghostAdminToken(adminKey: string, now = Date.now()): Promise<string> {
  const splitAt = adminKey.indexOf(":");
  const id = adminKey.slice(0, splitAt).trim();
  const secret = adminKey.slice(splitAt + 1).trim();
  if (!id || !secret) throw new Error("Ghost 密钥写成 id:secret");
  const header = bytesToB64Url(utf8(JSON.stringify({ alg: "HS256", kid: id, typ: "JWT" })));
  const issued = Math.floor(now / 1000);
  const payload = bytesToB64Url(
    utf8(JSON.stringify({ iat: issued, exp: issued + 300, aud: "/admin/" })),
  );
  const data = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "raw",
    toArrayBuffer(hexToBytes(secret)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, toArrayBuffer(utf8(data))));
  return `${data}.${bytesToB64Url(signature)}`;
}

type TargetMap = Record<string, Partial<Record<PlatformId, TargetRecord>>>;

function readTargetMap(): TargetMap {
  try {
    const raw = localStorage.getItem(TARGETS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as TargetMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function targetFor(noteId: string, platform: PlatformId): TargetRecord | null {
  const record = readTargetMap()[noteId]?.[platform];
  if (!record || typeof record.remoteId !== "string" || !record.remoteId) return null;
  return record;
}

export function noteIdForTarget(platform: PlatformId, remoteId: string): string | null {
  if (!remoteId) return null;
  const map = readTargetMap();
  for (const [noteId, record] of Object.entries(map)) {
    if (record?.[platform]?.remoteId === remoteId) return noteId;
  }
  return null;
}

export function rememberTarget(noteId: string, platform: PlatformId, remoteId: string, url: string) {
  try {
    const map = readTargetMap();
    const current = map[noteId] ?? {};
    current[platform] = { remoteId, url, at: Date.now() };
    map[noteId] = current;
    localStorage.setItem(TARGETS_KEY, JSON.stringify(map));
  } catch {
    // private mode
  }
}
