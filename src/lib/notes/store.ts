import { useMemo } from "react";
import { create } from "zustand";
import { titleFromContent } from "./format";
import { createSeedNotes } from "./seed";
import type { Note, PreviewMode } from "./types";

type NotesState = {
  notes: Note[];
  activeId: string | null;
  query: string;
  previewMode: PreviewMode;
  sidebarOpen: boolean;
  hydrated: boolean;
  createNote: () => string;
  deleteNote: (id: string) => void;
  updateNote: (id: string, content: string) => void;
  selectNote: (id: string) => void;
  setQuery: (query: string) => void;
  setPreviewMode: (mode: PreviewMode) => void;
  cyclePreviewMode: () => void;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
};

type PersistedSlice = {
  notes: Note[];
  activeId: string | null;
  previewMode: PreviewMode;
};

const STORAGE_KEY = "jingjian.notes.v1";
const PREVIEW_ORDER: PreviewMode[] = ["edit", "split", "preview"];

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
    };
  } catch {
    return null;
  }
}

function writePersisted(state: NotesState) {
  const payload: PersistedSlice = {
    notes: state.notes,
    activeId: state.activeId,
    previewMode: state.previewMode,
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
  createNote: () => {
    const existingEmpty = get().notes.find((note) => !note.content.trim());
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
    };
    set({
      notes: [note, ...get().notes],
      activeId: note.id,
      query: "",
      previewMode: get().previewMode === "preview" ? "edit" : get().previewMode,
      sidebarOpen: false,
    });
    return note.id;
  },
  deleteNote: (id) => {
    const remaining = get().notes.filter((note) => note.id !== id);
    const nextId = get().activeId === id ? (remaining[0]?.id ?? null) : get().activeId;
    set({ notes: remaining, activeId: nextId });
  },
  updateNote: (id, content) => {
    set({
      notes: get().notes.map((note) =>
        note.id === id ? { ...note, content, updatedAt: Date.now() } : note,
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
}));

let persistBound = false;

function bindPersistence() {
  if (persistBound) return;
  persistBound = true;
  useNotesStore.subscribe((state) => {
    if (!state.hydrated) return;
    writePersisted(state);
  });
}

export function hydrateNotesStore(): void {
  bindPersistence();
  const persisted = readPersisted();
  if (persisted) {
    useNotesStore.setState({ ...persisted, hydrated: true });
    return;
  }
  const seeded = createSeedNotes();
  useNotesStore.setState({
    notes: seeded,
    activeId: seeded[0]?.id ?? null,
    hydrated: true,
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
    const q = query.trim().toLowerCase();
    return [...notes]
      .filter((note) => {
        if (!q) return true;
        return (
          titleFromContent(note.content).toLowerCase().includes(q) ||
          note.content.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes, query]);
}
