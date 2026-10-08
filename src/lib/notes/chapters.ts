import { isLargeNote } from "./format.ts";
import { isTrashed } from "./trash.ts";
import type { Note } from "./types.ts";

function bookSiblings(notes: Note[], bookId: string): Note[] {
  return notes
    .filter((note) => note.bookId === bookId && !isTrashed(note))
    .sort(
      (a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0) || a.id.localeCompare(b.id),
    );
}

function paintIndexes(notes: Note[], ordered: Note[], now: number): Note[] {
  const indexOf = new Map(ordered.map((note, index) => [note.id, index]));
  return notes.map((note) => {
    const index = indexOf.get(note.id);
    if (index == null || note.chapterIndex === index) return note;
    return { ...note, chapterIndex: index, updatedAt: now };
  });
}

export function moveChapterToNotes(notes: Note[], id: string, toIndex: number): Note[] | null {
  const note = notes.find((item) => item.id === id);
  if (!note?.bookId || isTrashed(note)) return null;
  const siblings = bookSiblings(notes, note.bookId);
  const from = siblings.findIndex((item) => item.id === id);
  if (from < 0) return null;
  const target = Math.max(0, Math.min(toIndex, siblings.length - 1));
  if (target === from) return null;
  const next = siblings.slice();
  const [moved] = next.splice(from, 1);
  if (!moved) return null;
  next.splice(target, 0, moved);
  return paintIndexes(notes, next, Date.now());
}

export function mergeChapterNotes(
  notes: Note[],
  id: string,
  now = Date.now(),
): { notes: Note[]; removedId: string } | null {
  const note = notes.find((item) => item.id === id);
  if (!note?.bookId || isTrashed(note)) return null;
  const siblings = bookSiblings(notes, note.bookId);
  const index = siblings.findIndex((item) => item.id === id);
  const nextChapter = siblings[index + 1];
  if (index < 0 || !nextChapter) return null;
  const content = `${note.content.replace(/\s+$/, "")}\n\n${nextChapter.content.replace(/^\s+/, "")}`;
  const removedId = nextChapter.id;
  const kept = siblings.filter((item) => item.id !== removedId);
  const merged = notes
    .filter((item) => item.id !== removedId)
    .map((item) =>
      item.id === note.id
        ? {
            ...item,
            content,
            updatedAt: now,
            overflow: isLargeNote(content) ? true : undefined,
          }
        : item,
    );
  return { notes: paintIndexes(merged, kept, now), removedId };
}

export function splitChapterNotes(
  notes: Note[],
  id: string,
  offset: number,
  now = Date.now(),
  newId = "",
): { notes: Note[]; createdId: string } | null {
  const note = notes.find((item) => item.id === id);
  if (!note?.bookId || isTrashed(note) || !newId) return null;
  let at = Math.max(0, Math.min(offset, note.content.length));
  if (at > 0 && at < note.content.length) {
    const line = note.content.lastIndexOf("\n", at - 1);
    at = line >= 0 ? line + 1 : 0;
  }
  if (at <= 0 || at >= note.content.length) return null;
  const head = note.content.slice(0, at).replace(/\s+$/, "");
  const tail = note.content.slice(at).replace(/^\s+/, "");
  if (!head.trim() || !tail.trim()) return null;
  const siblings = bookSiblings(notes, note.bookId);
  const index = siblings.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const created: Note = {
    id: newId,
    content: tail,
    createdAt: now,
    updatedAt: now,
    bookId: note.bookId,
    bookTitle: note.bookTitle,
    ...(note.bookAuthor ? { bookAuthor: note.bookAuthor } : {}),
    ...(note.bookCover ? { bookCover: note.bookCover } : {}),
    ...(note.format ? { format: note.format } : {}),
    ...(note.folder ? { folder: note.folder } : {}),
    overflow: isLargeNote(tail) ? true : undefined,
  };
  const ordered = [...siblings.slice(0, index + 1), created, ...siblings.slice(index + 1)];
  const rewritten = notes.map((item) =>
    item.id === note.id
      ? {
          ...item,
          content: head,
          updatedAt: now,
          overflow: isLargeNote(head) ? true : undefined,
        }
      : item,
  );
  return { notes: paintIndexes([created, ...rewritten], ordered, now), createdId: newId };
}
