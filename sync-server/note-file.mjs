import { createHash } from "node:crypto";
import path from "node:path";

export const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function isInsideDir(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/**
 * Stable UUID (v5 layout) for a file that has no frontmatter id, so a plain
 * .md dropped into the notes folder keeps the same id on every load instead
 * of looking like a brand-new note to clients each sync.
 */
export function stableIdFor(fileName) {
  const h = createHash("sha1").update(`jingjian:${fileName}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20, 32)}`;
}

/** times: optional {createdAt, updatedAt} (e.g. file birth/mtime) used when frontmatter lacks them. */
export function parseNote(raw, fallbackId, times = {}) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const match = text.match(FRONTMATTER);
  const now = Date.now();
  const fbUpdated = Number(times.updatedAt) || now;
  const fbCreated = Number(times.createdAt) || fbUpdated;
  if (!match) {
    return { id: fallbackId, content: text, createdAt: fbCreated, updatedAt: fbUpdated, file: "" };
  }
  const meta = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return {
    id: meta.id || fallbackId,
    createdAt: Number(meta.createdAt) || fbCreated,
    updatedAt: Number(meta.updatedAt) || fbUpdated,
    content: text.slice(match[0].length),
    file: "",
  };
}

export function serialize(note) {
  return `---\nid: ${note.id}\ncreatedAt: ${note.createdAt}\nupdatedAt: ${note.updatedAt}\n---\n${note.content}`;
}

export function filenameFor(note) {
  const line = note.content.split("\n").find((entry) => entry.trim())?.trim() ?? "";
  const title = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/[*_`~]/g, "")
    .trim()
    // File names must not carry control characters.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .slice(0, 42) || "未命名笔记";
  const shortId = String(note.id).replace(/-/g, "").slice(0, 8);
  return `${title}.${shortId}.md`;
}

/** Keep the newest file when the same note id appears more than once. */
export function dedupeNotes(notes) {
  const byId = new Map();
  for (const note of notes) {
    const prev = byId.get(note.id);
    if (!prev || note.updatedAt >= prev.updatedAt) byId.set(note.id, note);
  }
  return [...byId.values()];
}
