import type { Note } from "./types.ts";

export type TrashedNote = Note & { deletedAt: number };

const STORAGE_KEY = "jingjian.trash.v1";
const MAX = 40;

function asNote(value: unknown): TrashedNote | null {
  if (!value || typeof value !== "object") return null;
  const note = value as Partial<TrashedNote>;
  if (
    typeof note.id !== "string" ||
    typeof note.content !== "string" ||
    typeof note.createdAt !== "number" ||
    typeof note.updatedAt !== "number"
  ) {
    return null;
  }
  return {
    ...(note as Note),
    deletedAt: typeof note.deletedAt === "number" ? note.deletedAt : Date.now(),
  };
}

export function readTrash(): TrashedNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map(asNote).filter((item): item is TrashedNote => Boolean(item));
  } catch {
    return [];
  }
}

function writeTrash(items: TrashedNote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items.slice(0, MAX)));
  } catch {
    // private mode
  }
}

export function pushTrash(note: Note, at = Date.now()): TrashedNote[] {
  const next = [{ ...note, deletedAt: at }, ...readTrash().filter((item) => item.id !== note.id)];
  writeTrash(next);
  return next;
}

export function restoreTrash(id: string): TrashedNote | null {
  const items = readTrash();
  const found = items.find((item) => item.id === id) ?? null;
  if (!found) return null;
  writeTrash(items.filter((item) => item.id !== id));
  return found;
}

export function dropTrash(id: string) {
  writeTrash(readTrash().filter((item) => item.id !== id));
}

export function emptyTrash() {
  writeTrash([]);
}
