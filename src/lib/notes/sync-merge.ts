import type { Note } from "./types";

export type MergeInput = {
  local: Note[];
  remote: Note[];
  tombstones: Record<string, number>;
  activeId?: string | null;
  now?: number;
  protectActive?: boolean;
};

export type MergeResult = {
  notes: Note[];
  tombstones: Record<string, number>;
  toUpload: Note[];
  toDeleteRemote: string[];
  conflicts: Array<{ local: Note; remote: Note }>;
};

const EDITING_WINDOW_MS = 60_000;

function isEditing(local: Note, input: MergeInput, now: number): boolean {
  if (!input.activeId || local.id !== input.activeId) return false;
  if (input.protectActive) return true;
  return now - local.updatedAt < EDITING_WINDOW_MS;
}

export function mergeNotes(input: MergeInput): MergeResult {
  const localMap = new Map(input.local.map((note) => [note.id, note]));
  const remoteMap = new Map(input.remote.map((note) => [note.id, note]));
  const tombstones = { ...input.tombstones };
  const notes = new Map<string, Note>();
  const toUpload: Note[] = [];
  const toDeleteRemote: string[] = [];
  const conflicts: Array<{ local: Note; remote: Note }> = [];
  const seen = new Set<string>();
  const now = input.now ?? Date.now();

  for (const [id, remote] of remoteMap) {
    seen.add(id);
    const deletedAt = tombstones[id];
    if (deletedAt) {
      if (remote.updatedAt > deletedAt) {
        notes.set(id, remote);
        delete tombstones[id];
      } else {
        toDeleteRemote.push(id);
      }
      continue;
    }
    const local = localMap.get(id);
    if (!local) {
      notes.set(id, remote);
      continue;
    }
    if (local.content === remote.content) {
      notes.set(id, local.updatedAt >= remote.updatedAt ? local : remote);
      continue;
    }
    if (isEditing(local, input, now)) {
      notes.set(id, local);
      toUpload.push(local);
      continue;
    }
    if (
      local.content !== remote.content &&
      !local.content.includes(remote.content) &&
      !remote.content.includes(local.content)
    ) {
      notes.set(id, local);
      conflicts.push({ local, remote });
      continue;
    }
    if (local.updatedAt > remote.updatedAt) {
      notes.set(id, local);
      toUpload.push(local);
      continue;
    }
    if (remote.updatedAt > local.updatedAt) {
      if (
        local.content.startsWith(remote.content) ||
        local.content.includes(remote.content)
      ) {
        notes.set(id, local);
        toUpload.push(local);
      } else {
        notes.set(id, remote);
      }
      continue;
    }
    const mergedContent = mergeNoteContent(local.content, remote.content);
    const next = { ...local, content: mergedContent };
    notes.set(id, next);
    if (mergedContent !== remote.content) toUpload.push(next);
  }

  for (const [id, local] of localMap) {
    if (seen.has(id)) continue;
    if (tombstones[id]) continue;
    notes.set(id, local);
    toUpload.push(local);
  }

  return {
    notes: [...notes.values()].sort((a, b) => b.updatedAt - a.updatedAt),
    tombstones,
    toUpload,
    toDeleteRemote,
    conflicts,
  };
}

export function notesFingerprint(notes: Note[]): string {
  return notes
    .map((note) => `${note.id}:${note.updatedAt}`)
    .sort()
    .join("|");
}

export function mergeNoteContent(local: string, remote: string): string {
  if (local === remote) return local;
  if (!local.trim()) return remote;
  if (!remote.trim()) return local;
  if (local.startsWith(remote) || local.includes(remote)) return local;
  if (remote.startsWith(local) || remote.includes(local)) return remote;
  return local;
}

export function reconcileNotes(
  local: Note[],
  remote: Note[],
  activeId: string | null,
  now = Date.now(),
): { notes: Note[]; activeContentChanged: boolean } {
  const localMap = new Map(local.map((note) => [note.id, note]));
  const notes: Note[] = [];
  const seen = new Set<string>();
  let activeContentChanged = false;

  for (const remoteNote of remote) {
    seen.add(remoteNote.id);
    const current = localMap.get(remoteNote.id);
    if (!current) {
      notes.push(remoteNote);
      continue;
    }
    if (current.content === remoteNote.content) {
      notes.push(current.updatedAt >= remoteNote.updatedAt ? current : remoteNote);
      continue;
    }
    const editing =
      current.id === activeId && now - current.updatedAt < EDITING_WINDOW_MS;
    if (editing || current.updatedAt >= remoteNote.updatedAt) {
      notes.push(current);
      continue;
    }
    const mergedContent = mergeNoteContent(current.content, remoteNote.content);
    notes.push({
      ...remoteNote,
      content: mergedContent,
      updatedAt: Math.max(current.updatedAt, remoteNote.updatedAt),
    });
    if (current.id === activeId && mergedContent !== current.content) {
      activeContentChanged = true;
    }
  }

  for (const current of local) {
    if (!seen.has(current.id)) notes.push(current);
  }

  return {
    notes: notes.sort((a, b) => b.updatedAt - a.updatedAt),
    activeContentChanged,
  };
}
