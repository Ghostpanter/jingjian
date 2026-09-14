import { useMemo } from "react";
import { create } from "zustand";
import {
  isBlankContent,
  isLargeNote,
  matchesQuery,
  NOTE_HEAD_SCAN,
  titleFromContent,
} from "./format";
import { deleteOverflow, getOverflow, putOverflow } from "./overflow";
import { createSeedNotes } from "./seed";
import { notesFingerprint, reconcileNotes } from "./sync-merge";
import { collectFolders, normalizeFolder, remainingAfterDeleteFolder } from "./folder-tree";
import type { Note, PreviewMode } from "./types";

type NotesState = {
  notes: Note[];
  activeId: string | null;
  query: string;
  previewMode: PreviewMode;
  sidebarOpen: boolean;
  hydrated: boolean;
  editorEpoch: number;
  folders: string[];
  createNote: (options?: { format?: Note["format"]; folder?: string }) => string;
  deleteNote: (id: string) => void;
  updateNote: (id: string, content: string) => void;
  selectNote: (id: string) => void;
  setQuery: (query: string) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  cyclePreviewMode: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  applySyncedNotes: (notes: Note[]) => void;
  importNotes: (notes: Note[]) => void;
  makeBookFromNote: (noteId: string, title?: string) => string | null;
  addChapter: (bookId: string) => string | null;
  renameBook: (bookId: string, title: string) => void;
  createFolder: (path: string) => string | null;
  moveNote: (id: string, folder: string | null) => void;
  deleteFolder: (path: string) => string[];
};

type PersistedSlice = {
  notes: Note[];
  activeId: string | null;
  previewMode: PreviewMode;
  folders: string[];
};

const STORAGE_KEY = "jingjian.notes.v1";
const PREVIEW_ORDER: PreviewMode[] = ["edit", "split", "preview"];
const PERSIST_DEBOUNCE_MS = 280;

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== "object") return false;
  const note = value as Partial<Note>;
  return (
    typeof note.id === "string" &&
    typeof note.content === "string" &&
    typeof note.createdAt === "number" &&
    typeof note.updatedAt === "number"
  );
}

function isPreviewMode(value: unknown): value is PreviewMode {
  return value === "edit" || value === "split" || value === "preview";
}

function readPersisted(): PersistedSlice | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: PersistedSlice } | PersistedSlice;
    const data = "state" in parsed && parsed.state ? parsed.state : (parsed as PersistedSlice);
    const notes = Array.isArray(data.notes) ? data.notes.filter(isNote) : [];
    if (notes.length === 0) return null;
    const activeId =
      typeof data.activeId === "string" && notes.some((note) => note.id === data.activeId)
        ? data.activeId
        : (notes[0]?.id ?? null);
    return {
      notes,
      activeId,
      previewMode: isPreviewMode(data.previewMode) ? data.previewMode : "edit",
      folders: collectFolders(
        notes,
        Array.isArray((data as { folders?: unknown }).folders)
          ? ((data as { folders: unknown[] }).folders.filter(
              (item): item is string => typeof item === "string",
            ))
          : [],
      ),
    };
  } catch {
    return null;
  }
}

async function restoreOverflowNotes(notes: Note[]): Promise<Note[]> {
  if (!notes.some((note) => note.overflow)) return notes;
  return Promise.all(
    notes.map(async (note) => {
      if (!note.overflow) return note;
      const body = await getOverflow(note.id);
      if (!body) return note;
      return { ...note, content: body, overflow: true };
    }),
  );
}

async function writePersisted(state: NotesState) {
  const notes: Note[] = [];
  for (const note of state.notes) {
    if (isLargeNote(note.content)) {
      await putOverflow(note.id, note.content);
      notes.push({
        ...note,
        content: note.content.slice(0, NOTE_HEAD_SCAN),
        overflow: true,
      });
      continue;
    }
    if (note.overflow) await deleteOverflow(note.id);
    const { overflow: _overflow, ...rest } = note;
    notes.push(rest);
  }
  const payload: PersistedSlice = {
    notes,
    activeId: state.activeId,
    previewMode: state.previewMode,
    folders: collectFolders(state.notes, state.folders),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Quota or private mode — keep working in memory.
  }
}

export const useNotesStore = create<NotesState>()((set, get) => ({
  notes: [],
  activeId: null,
  query: "",
  previewMode: "edit",
  sidebarOpen: true,
  hydrated: false,
  editorEpoch: 0,
  folders: [],
  createNote: (options?) => {
    const format = options?.format === "txt" ? "txt" : undefined;
    const folder = normalizeFolder(options?.folder ?? "");
    const existingEmpty = get().notes.find(
      (note) =>
        isBlankContent(note.content) &&
        !note.bookId &&
        (note.format ?? "md") === (format ?? "md") &&
        (note.folder ?? "") === folder,
    );
    if (existingEmpty) {
      set({ activeId: existingEmpty.id, query: "", sidebarOpen: false });
      return existingEmpty.id;
    }
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      content: "",
      createdAt: now,
      updatedAt: now,
      ...(format ? { format } : {}),
      ...(folder ? { folder } : {}),
    };
    set({
      notes: [note, ...get().notes],
      activeId: note.id,
      query: "",
      previewMode: get().previewMode === "preview" ? "edit" : get().previewMode,
      sidebarOpen: false,
      folders: folder ? collectFolders([note, ...get().notes], get().folders) : get().folders,
    });
    return note.id;
  },
  deleteNote: (id) => {
    const remaining = get().notes.filter((note) => note.id !== id);
    const nextId = get().activeId === id ? (remaining[0]?.id ?? null) : get().activeId;
    void deleteOverflow(id);
    set({ notes: remaining, activeId: nextId });
  },
  updateNote: (id, content) => {
    set({
      notes: get().notes.map((note) =>
        note.id === id
          ? {
              ...note,
              content,
              updatedAt: Date.now(),
              overflow: isLargeNote(content) ? true : undefined,
            }
          : note,
      ),
    });
  },
  selectNote: (id) => set({ activeId: id, sidebarOpen: false }),
  setQuery: (query) => set({ query }),
  setPreviewMode: (previewMode) => set({ previewMode }),
  cyclePreviewMode: () => {
    const current = get().previewMode;
    const index = PREVIEW_ORDER.indexOf(current);
    set({ previewMode: PREVIEW_ORDER[(index + 1) % PREVIEW_ORDER.length] });
  },
  toggleSidebar: () => set({ sidebarOpen: !get().sidebarOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  applySyncedNotes: (incoming) => {
    const current = get();
    if (notesFingerprint(current.notes) === notesFingerprint(incoming)) return;
    const reconciled = reconcileNotes(current.notes, incoming, current.activeId);
    const activeId =
      current.activeId && reconciled.notes.some((note) => note.id === current.activeId)
        ? current.activeId
        : (reconciled.notes[0]?.id ?? null);
    set({
      notes: reconciled.notes,
      activeId,
      editorEpoch: reconciled.activeContentChanged
        ? current.editorEpoch + 1
        : current.editorEpoch,
      folders: collectFolders(reconciled.notes, current.folders),
    });
  },
  importNotes: (incoming) => {
    if (incoming.length === 0) return;
    const existing = get().notes.filter(
      (note) => !incoming.some((item) => item.id === note.id),
    );
    const large = incoming.some((note) => isLargeNote(note.content));
    const notes = [...incoming, ...existing];
    set({
      notes,
      activeId: incoming[0]?.id ?? get().activeId,
      query: "",
      sidebarOpen: false,
      previewMode: large ? "edit" : "preview",
      folders: collectFolders(notes, get().folders),
    });
  },
  makeBookFromNote: (noteId, title) => {
    const current = get().notes.find((note) => note.id === noteId);
    if (!current) return null;
    if (current.bookId) return current.bookId;
    const bookId = crypto.randomUUID();
    const bookTitle = title?.trim() || titleFromContent(current.content);
    set({
      notes: get().notes.map((note) =>
        note.id === noteId
          ? { ...note, bookId, bookTitle, chapterIndex: 0, updatedAt: Date.now() }
          : note,
      ),
    });
    return bookId;
  },
  addChapter: (bookId) => {
    const siblings = get().notes.filter((note) => note.bookId === bookId);
    if (siblings.length === 0) return null;
    const bookTitle = siblings[0]?.bookTitle || "电子书";
    const nextIndex =
      Math.max(...siblings.map((note) => note.chapterIndex ?? 0), -1) + 1;
    const now = Date.now();
    const note: Note = {
      id: crypto.randomUUID(),
      content: `# 第 ${nextIndex + 1} 章\n\n`,
      createdAt: now,
      updatedAt: now,
      bookId,
      bookTitle,
      chapterIndex: nextIndex,
    };
    set({
      notes: [note, ...get().notes],
      activeId: note.id,
      query: "",
      previewMode: get().previewMode === "preview" ? "edit" : get().previewMode,
      sidebarOpen: false,
      editorEpoch: get().editorEpoch + 1,
    });
    return note.id;
  },
  renameBook: (bookId, title) => {
    const bookTitle = title.trim();
    if (!bookTitle) return;
    set({
      notes: get().notes.map((note) =>
        note.bookId === bookId ? { ...note, bookTitle, updatedAt: Date.now() } : note,
      ),
    });
  },
  createFolder: (path) => {
    const folder = normalizeFolder(path);
    if (!folder) return null;
    set({ folders: collectFolders(get().notes, [...get().folders, folder]) });
    return folder;
  },
  moveNote: (id, folder) => {
    const next = folder ? normalizeFolder(folder) : "";
    const notes = get().notes.map((note) =>
      note.id === id
        ? {
            ...note,
            folder: next || undefined,
            updatedAt: Date.now(),
          }
        : note,
    );
    set({
      notes,
      folders: collectFolders(notes, next ? [...get().folders, next] : get().folders),
    });
  },
  deleteFolder: (path) => {
    const result = remainingAfterDeleteFolder(get().notes, get().folders, path);
    for (const id of result.removedIds) void deleteOverflow(id);
    const currentId = get().activeId;
    const activeId =
      currentId && result.removedIds.includes(currentId)
        ? (result.notes[0]?.id ?? null)
        : currentId;
    set({
      notes: result.notes,
      folders: result.folders,
      activeId,
    });
    return result.removedIds;
  },
}));

let persistBound = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistChain: Promise<void> = Promise.resolve();

function bindPersistence() {
  if (persistBound) return;
  persistBound = true;
  useNotesStore.subscribe(() => {
    if (!useNotesStore.getState().hydrated) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      persistChain = persistChain
        .then(() => {
          const state = useNotesStore.getState();
          if (!state.hydrated) return;
          return writePersisted(state);
        })
        .catch(() => undefined);
    }, PERSIST_DEBOUNCE_MS);
  });
}

export function hydrateNotesStore(): void {
  bindPersistence();
  const persisted = readPersisted();
  if (!persisted) {
    const seeded = createSeedNotes();
    useNotesStore.setState({
      notes: seeded,
      activeId: seeded[0]?.id ?? null,
      folders: collectFolders(seeded, ["手册"]),
      hydrated: true,
    });
    return;
  }
  if (!persisted.notes.some((note) => note.overflow)) {
    useNotesStore.setState({ ...persisted, hydrated: true });
    return;
  }
  void restoreOverflowNotes(persisted.notes).then((notes) => {
    useNotesStore.setState({ ...persisted, notes, hydrated: true });
  });
}

export function useActiveNote(): Note | null {
  const notes = useNotesStore((state) => state.notes);
  const activeId = useNotesStore((state) => state.activeId);
  return useMemo(
    () => notes.find((note) => note.id === activeId) ?? null,
    [notes, activeId],
  );
}

export function useSortedNotes(): Note[] {
  const notes = useNotesStore((state) => state.notes);
  const query = useNotesStore((state) => state.query);
  return useMemo(() => {
    return [...notes]
      .filter((note) => matchesQuery(note, query))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, query]);
}
