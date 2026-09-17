import { firstLineTitle } from "./format.ts";
import type { Note } from "./types.ts";

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/;

export { firstLineTitle };

export function isNoteFilename(name: string): boolean {
  return /\.(md|markdown|txt)$/i.test(name);
}

export function noteExtension(note: Pick<Note, "format">): "md" | "txt" {
  return note.format === "txt" ? "txt" : "md";
}

export function filenameForNote(note: Note): string {
  const stem = firstLineTitle(note.content)
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 42);
  const shortId = note.id.replace(/-/g, "").slice(0, 8);
  return `${stem || "未命名笔记"}.${shortId}.${noteExtension(note)}`;
}

function unquote(value: string): string {
  return value.replace(/^"|"$/g, "");
}

export function serializeNote(note: Note): string {
  const book = note.bookId
    ? `\nbookId: ${note.bookId}\nbookTitle: ${JSON.stringify(note.bookTitle ?? "")}\nchapterIndex: ${note.chapterIndex ?? 0}${
        note.bookAuthor ? `\nbookAuthor: ${JSON.stringify(note.bookAuthor)}` : ""
      }${note.bookCover ? `\nbookCover: ${JSON.stringify(note.bookCover)}` : ""}`
    : "";
  const read =
    typeof note.readAt === "number"
      ? `\nreadAt: ${note.readAt}\nreadRatio: ${Number(note.readRatio ?? 0)}`
      : "";
  const format = note.format === "txt" ? "\nformat: txt" : "";
  const folder = note.folder ? `\nfolder: ${JSON.stringify(note.folder)}` : "";
  return `---\nid: ${note.id}\ncreatedAt: ${note.createdAt}\nupdatedAt: ${note.updatedAt}${format}${book}${read}${folder}\n---\n${note.content}`;
}

export function parseNoteFile(raw: string, fallbackId: string): Note {
  const text = raw.replace(/^\uFEFF/, "");
  const now = Date.now();
  const source = text.startsWith("---")
    ? (text.length > 8192 ? text.slice(0, 8192) : text)
    : "";
  const match = source ? source.match(FRONTMATTER) : null;
  if (!match) {
    return {
      id: fallbackId,
      content: text,
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
  const bookId = meta.bookId || undefined;
  const bookTitle = meta.bookTitle ? unquote(meta.bookTitle) : undefined;
  const bookAuthor = meta.bookAuthor ? unquote(meta.bookAuthor) : undefined;
  const bookCover = meta.bookCover ? unquote(meta.bookCover) : undefined;
  const chapterIndex = meta.chapterIndex ? Number(meta.chapterIndex) : undefined;
  const readAt = meta.readAt ? Number(meta.readAt) : undefined;
  const readRatio = meta.readRatio ? Number(meta.readRatio) : undefined;
  const format = meta.format === "txt" ? ("txt" as const) : undefined;
  const folderRaw = meta.folder ? unquote(meta.folder) : "";
  return {
    id: meta.id || fallbackId,
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Date.now(),
    content: text.slice(match[0].length),
    ...(format ? { format } : {}),
    ...(bookId ? { bookId, bookTitle, chapterIndex } : {}),
    ...(bookAuthor ? { bookAuthor } : {}),
    ...(bookCover ? { bookCover } : {}),
    ...(typeof readAt === "number" && Number.isFinite(readAt) ? { readAt } : {}),
    ...(typeof readRatio === "number" && Number.isFinite(readRatio)
      ? { readRatio }
      : {}),
    ...(folderRaw ? { folder: folderRaw } : {}),
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
