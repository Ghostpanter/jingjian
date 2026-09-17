import type { Note } from "./types";
import { withLatestProgress } from "./reader-progress.ts";

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
      const winner = local.updatedAt >= remote.updatedAt ? local : remote;
      const merged = withLatestProgress(winner, local, remote);
      notes.set(id, merged);
      if ((local.readAt ?? 0) > (remote.readAt ?? 0)) toUpload.push(merged);
      continue;
    }
    if (isEditing(local, input, now)) {
      const merged = withLatestProgress(local, local, remote);
      notes.set(id, merged);
      toUpload.push(merged);
      continue;
    }
    if (
      local.content !== remote.content &&
      !local.content.includes(remote.content) &&
      !remote.content.includes(local.content)
    ) {
      notes.set(id, withLatestProgress(local, local, remote));
      conflicts.push({ local, remote });
      continue;
    }
    if (local.updatedAt > remote.updatedAt) {
      const merged = withLatestProgress(local, local, remote);
      notes.set(id, merged);
      toUpload.push(merged);
      continue;
    }
    if (remote.updatedAt > local.updatedAt) {
      if (
        local.content.startsWith(remote.content) ||
        local.content.includes(remote.content)
      ) {
        const merged = withLatestProgress(local, local, remote);
        notes.set(id, merged);
        toUpload.push(merged);
      } else {
        const merged = withLatestProgress(remote, local, remote);
        notes.set(id, merged);
        if ((local.readAt ?? 0) > (remote.readAt ?? 0)) toUpload.push(merged);
      }
      continue;
    }
    const mergedContent = mergeNoteContent(local.content, remote.content);
    const next = withLatestProgress(
      { ...local, content: mergedContent },
      local,
      remote,
    );
    notes.set(id, next);
    if (mergedContent !== remote.content || (local.readAt ?? 0) > (remote.readAt ?? 0)) {
      toUpload.push(next);
    }
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
    .map((note) => `${note.id}:${note.updatedAt}:${note.readAt ?? 0}`)
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
      const winner =
        current.updatedAt >= remoteNote.updatedAt ? current : remoteNote;
      notes.push(withLatestProgress(winner, current, remoteNote));
      continue;
    }
    const editing =
      current.id === activeId && now - current.updatedAt < EDITING_WINDOW_MS;
    if (editing || current.updatedAt >= remoteNote.updatedAt) {
      notes.push(withLatestProgress(current, current, remoteNote));
      continue;
    }
    const mergedContent = mergeNoteContent(current.content, remoteNote.content);
    notes.push(
      withLatestProgress(
        {
          ...remoteNote,
          content: mergedContent,
          updatedAt: Math.max(current.updatedAt, remoteNote.updatedAt),
        },
        current,
        remoteNote,
      ),
    );
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
