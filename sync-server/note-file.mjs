import path from "node:path";

export const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function isInsideDir(root, target) {
  const rel = path.relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export function parseNote(raw, fallbackId) {
  const text = String(raw || "").replace(/^\uFEFF/, "");
  const match = text.match(FRONTMATTER);
  if (!match) {
    const now = Date.now();
    return { id: fallbackId, content: text, createdAt: now, updatedAt: now, file: "" };
  }
  const meta = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return {
    id: meta.id || fallbackId,
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Date.now(),
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
