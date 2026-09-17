import type { Note } from "./types.ts";

export const EXCERPT_FOLDER = "摘录";
export const SESSION_KEY = "jingjian.reader.session.v1";

export type ReaderSession = {
  bookId: string;
  noteId: string;
  readerOpen: boolean;
  ratio: number;
  at: number;
};

export function lastReadChapter(notes: Note[]): Note | null {
  if (notes.length === 0) return null;
  const sorted = [...notes].sort((a, b) => {
    const read = (b.readAt ?? 0) - (a.readAt ?? 0);
    if (read !== 0) return read;
    return (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0);
  });
  return sorted[0] ?? null;
}

export function chapterProgress(notes: Note[]): { current: number; total: number } {
  const total = notes.length;
  if (total === 0) return { current: 0, total: 0 };
  const last = lastReadChapter(notes);
  if (!last) return { current: 1, total };
  const ordered = [...notes].sort(
    (a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0),
  );
  const index = ordered.findIndex((note) => note.id === last.id);
  return { current: Math.max(1, index + 1), total };
}

export function withLatestProgress(base: Note, a: Note, b: Note): Note {
  const src = (a.readAt ?? 0) >= (b.readAt ?? 0) ? a : b;
  if (!src.readAt) return base;
  return {
    ...base,
    readAt: src.readAt,
    readRatio: src.readRatio,
  };
}

export function readReaderSession(): ReaderSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ReaderSession>;
    if (!parsed || typeof parsed.noteId !== "string" || typeof parsed.bookId !== "string") {
      return null;
    }
    return {
      bookId: parsed.bookId,
      noteId: parsed.noteId,
      readerOpen: Boolean(parsed.readerOpen),
      ratio: typeof parsed.ratio === "number" && Number.isFinite(parsed.ratio) ? parsed.ratio : 0,
      at: typeof parsed.at === "number" ? parsed.at : 0,
    };
  } catch {
    return null;
  }
}

export function writeReaderSession(session: ReaderSession | null) {
  try {
    if (!session) localStorage.removeItem(SESSION_KEY);
    else localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // private mode
  }
}

export function excerptNoteContent(options: {
  bookTitle: string;
  chapterTitle: string;
  quote: string;
}): string {
  const quote = options.quote
    .trim()
    .split(/\n+/)
    .map((line) => `> ${line}`)
    .join("\n");
  return `# 摘自《${options.bookTitle}》\n\n${quote}\n\n来自「${options.chapterTitle}」\n`;
}
