import { filenameForNote, parseNoteFile, serializeNote } from "./markdown-file";
import { basicAuth, joinUrl, request } from "./sync-http";
import type { SyncAdapter, SyncConfig } from "./sync-types";
import type { Note } from "./types";

function encodePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function collectionUrl(config: SyncConfig): string {
  const root = config.webdavUrl.trim().replace(/\/+$/, "");
  const folder = config.webdavPath.trim().replace(/^\/+|\/+$/g, "");
  return folder ? `${root}/${encodePath(folder)}/` : `${root}/`;
}

function auth(config: SyncConfig): HeadersInit {
  return { Authorization: basicAuth(config.webdavUser.trim(), config.webdavPassword) };
}

function decodeHref(href: string): string {
  try {
    return decodeURIComponent(href);
  } catch {
    return href;
  }
}

function filenamesFromPropfind(xml: string, collection: string): string[] {
  const names = new Set<string>();
  const matches = xml.matchAll(/<[^>]*href[^>]*>([^<]+)<\/[^>]*href>/gi);
  const collectionPath = decodeHref(new URL(collection, "https://dummy.local").pathname);
  for (const match of matches) {
    const href = decodeHref(match[1].trim());
    const path = href.startsWith("http") ? new URL(href).pathname : href;
    if (path.endsWith("/")) continue;
    const file = path.split("/").filter(Boolean).pop();
    if (!file || !file.toLowerCase().endsWith(".md")) continue;
    if (path.replace(/\/+$/, "") === collectionPath.replace(/\/+$/, "")) continue;
    names.add(file);
  }
  return [...names];
}

async function ensureCollection(config: SyncConfig): Promise<string> {
  const url = collectionUrl(config);
  const listed = await request(url, {
    method: "PROPFIND",
    headers: {
      ...auth(config),
      Depth: "0",
      "Content-Type": "application/xml; charset=utf-8",
    },
    body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>`,
  });
  if (listed.status === 404) {
    const created = await request(url, { method: "MKCOL", headers: auth(config) });
    if (!created.ok && created.status !== 201 && created.status !== 405) {
      throw new Error("无法创建远程目录，请检查路径与权限");
    }
    return url;
  }
  if (listed.status !== 207 && !listed.ok) {
    throw new Error(`WebDAV 无法访问（${listed.status}）`);
  }
  return url;
}

export function createWebdavAdapter(config: SyncConfig): SyncAdapter {
  return {
    async test() {
      await ensureCollection(config);
      return `WebDAV 目录 ${config.webdavPath || "/"} 可用`;
    },
    async list() {
      const url = await ensureCollection(config);
      const response = await request(url, {
        method: "PROPFIND",
        headers: {
          ...auth(config),
          Depth: "1",
          "Content-Type": "application/xml; charset=utf-8",
        },
        body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:resourcetype/></d:prop></d:propfind>`,
      });
      if (response.status !== 207 && !response.ok) {
        throw new Error(`列出文件失败（${response.status}）`);
      }
      const xml = await response.text();
      const files = filenamesFromPropfind(xml, url);
      const notes: Note[] = [];
      for (const file of files) {
        const body = await request(joinUrl(url, encodeURIComponent(file)), {
          headers: auth(config),
        });
        if (!body.ok) continue;
        const raw = await body.text();
        const fallback = file.replace(/\.md$/i, "");
        notes.push(parseNoteFile(raw, fallback));
      }
      return notes;
    },
    async upsert(note) {
      const url = await ensureCollection(config);
      const name = filenameForNote(note);
      const response = await request(joinUrl(url, encodeURIComponent(name)), {
        method: "PUT",
        headers: {
          ...auth(config),
          "Content-Type": "text/markdown; charset=utf-8",
        },
        body: serializeNote(note),
      });
      if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw new Error(`上传失败（${response.status}）`);
      }
    },
    async remove(id) {
      const url = await ensureCollection(config);
      const response = await request(url, {
        method: "PROPFIND",
        headers: {
          ...auth(config),
          Depth: "1",
          "Content-Type": "application/xml; charset=utf-8",
        },
        body: `<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>`,
      });
      if (response.status !== 207 && !response.ok) return;
      const files = filenamesFromPropfind(await response.text(), url);
      for (const file of files) {
        if (!file.replace(/-/g, "").includes(id.replace(/-/g, "").slice(0, 8))) continue;
        await request(joinUrl(url, encodeURIComponent(file)), {
          method: "DELETE",
          headers: auth(config),
        });
      }
    },
  };
}
