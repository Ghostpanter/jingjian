import type { Note } from "./types";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export function firstLineTitle(content: string): string {
  const line =
    content.split("\n").find((entry) => entry.trim().length > 0)?.trim() ?? "";
  const stripped = line
    .replace(/^#{1,6}\s+/, "")
    .replace(/^\s*[-*+]\s+(\[[ xX]\]\s+)?/, "")
    .replace(/^>\s+/, "")
    .replace(/[*_`~]/g, "")
    .trim();
  return stripped || "未命名笔记";
}

export function filenameForNote(note: Note): string {
  const stem = firstLineTitle(note.content)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
  const shortId = note.id.replace(/-/g, "").slice(0, 8);
  return `${stem || "未命名笔记"}.${shortId}.md`;
}

export function serializeNote(note: Note): string {
  return `---\nid: ${note.id}\ncreatedAt: ${note.createdAt}\nupdatedAt: ${note.updatedAt}\n---\n${note.content}`;
}

export function parseNoteFile(raw: string, fallbackId: string): Note {
  const match = raw.match(FRONTMATTER);
  if (!match) {
    const now = Date.now();
    return {
      id: fallbackId,
      content: raw.replace(/^\uFEFF/, ""),
      createdAt: now,
      updatedAt: now,
    };
  }
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const index = line.indexOf(":");
    if (index <= 0) continue;
    meta[line.slice(0, index).trim()] = line.slice(index + 1).trim();
  }
  return {
    id: meta.id || fallbackId,
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Date.now(),
    content: raw.slice(match[0].length).replace(/^\uFEFF/, ""),
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
