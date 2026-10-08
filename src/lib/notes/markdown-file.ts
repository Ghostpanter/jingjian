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
  const opened = typeof note.openedAt === "number" ? `\nopenedAt: ${note.openedAt}` : "";
  const star =
    typeof note.starredAt === "number"
      ? `\nstarred: ${note.starred ? "true" : "false"}\nstarredAt: ${note.starredAt}`
      : "";
  const trashed = typeof note.trashedAt === "number" ? `\ntrashedAt: ${note.trashedAt}` : "";
  const restored = typeof note.restoredAt === "number" ? `\nrestoredAt: ${note.restoredAt}` : "";
  const format = note.format === "txt" ? "\nformat: txt" : "";
  const folder = note.folder ? `\nfolder: ${JSON.stringify(note.folder)}` : "";
  return `---\nid: ${note.id}\ncreatedAt: ${note.createdAt}\nupdatedAt: ${note.updatedAt}${format}${book}${read}${opened}${star}${trashed}${restored}${folder}\n---\n${note.content}`;
}

export function parseNoteFile(raw: string, fallbackId: string): Note {
  const text = raw.replace(/^\uFEFF/, "");
  const now = Date.now();
  const source = text.startsWith("---")
    ? (text.length > 8192 ? text.slice(0, 8192) : text)
    : "";
  const match = source ? source.match(FRONTMATTER) : null;
  if (!match) {
    const plain = splitImageTrailer(text);
    rememberSyncedImages(fallbackId, plain.images);
    return {
      id: fallbackId,
      content: plain.content,
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
  const openedAt = meta.openedAt ? Number(meta.openedAt) : undefined;
  const starredAt = meta.starredAt ? Number(meta.starredAt) : undefined;
  const starred = meta.starred === "true";
  const trashedAt = meta.trashedAt ? Number(meta.trashedAt) : undefined;
  const restoredAt = meta.restoredAt ? Number(meta.restoredAt) : undefined;
  const format = meta.format === "txt" ? ("txt" as const) : undefined;
  const folderRaw = meta.folder ? unquote(meta.folder) : "";
  const id = meta.id || fallbackId;
  const body = splitImageTrailer(text.slice(match[0].length));
  rememberSyncedImages(id, body.images);
  return {
    id,
    createdAt: Number(meta.createdAt) || Date.now(),
    updatedAt: Number(meta.updatedAt) || Date.now(),
    content: body.content,
    ...(format ? { format } : {}),
    ...(bookId ? { bookId, bookTitle, chapterIndex } : {}),
    ...(bookAuthor ? { bookAuthor } : {}),
    ...(bookCover ? { bookCover } : {}),
    ...(typeof readAt === "number" && Number.isFinite(readAt) ? { readAt } : {}),
    ...(typeof readRatio === "number" && Number.isFinite(readRatio)
      ? { readRatio }
      : {}),
    ...(typeof openedAt === "number" && Number.isFinite(openedAt) ? { openedAt } : {}),
    ...(typeof starredAt === "number" && Number.isFinite(starredAt)
      ? { starred: starred || undefined, starredAt }
      : {}),
    ...(typeof trashedAt === "number" && Number.isFinite(trashedAt) ? { trashedAt } : {}),
    ...(typeof restoredAt === "number" && Number.isFinite(restoredAt) ? { restoredAt } : {}),
    ...(folderRaw ? { folder: folderRaw } : {}),
  };
}

export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export type SyncedImagePayload = { id: string; mime: string; base64: string };

const IMAGE_START = "\n%%JINGJIAN-IMAGES%%\n";
const IMAGE_END = "%%END-JINGJIAN-IMAGES%%";
const pendingImages = new Map<string, SyncedImagePayload[]>();

export function splitImageTrailer(text: string): { content: string; images: SyncedImagePayload[] } {
  const start = text.lastIndexOf(IMAGE_START);
  if (start < 0) return { content: text, images: [] };
  const end = text.indexOf(IMAGE_END, start + IMAGE_START.length);
  if (end < 0) return { content: text, images: [] };
  const images: SyncedImagePayload[] = [];
  for (const raw of text.slice(start + IMAGE_START.length, end).split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const first = line.indexOf(" ");
    const second = line.indexOf(" ", first + 1);
    if (first <= 0 || second < 0) continue;
    const id = line.slice(0, first);
    const mime = line.slice(first + 1, second);
    const base64 = line.slice(second + 1).trim();
    if (!/^[a-z0-9-]+$/i.test(id) || !base64) continue;
    images.push({ id, mime, base64 });
  }
  return { content: text.slice(0, start), images };
}

export function rememberSyncedImages(noteId: string, images: SyncedImagePayload[]) {
  if (!noteId || images.length === 0) return;
  pendingImages.set(noteId, images);
}

export function takeSyncedImages(): Map<string, SyncedImagePayload[]> {
  const copy = new Map(pendingImages);
  pendingImages.clear();
  return copy;
}
