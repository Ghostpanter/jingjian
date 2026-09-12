import type { Note } from "./types";

export type MergeInput = {
  local: Note[];
  remote: Note[];
  tombstones: Record<string, number>;
};

export type MergeResult = {
  notes: Note[];
  tombstones: Record<string, number>;
  toUpload: Note[];
  toDeleteRemote: string[];
};

export function mergeNotes(input: MergeInput): MergeResult {
  const localMap = new Map(input.local.map((note) => [note.id, note]));
  const remoteMap = new Map(input.remote.map((note) => [note.id, note]));
  const tombstones = { ...input.tombstones };
  const notes = new Map<string, Note>();
  const toUpload: Note[] = [];
  const toDeleteRemote: string[] = [];
  const seen = new Set<string>();

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
    if (remote.updatedAt > local.updatedAt) {
      notes.set(id, remote);
    } else {
      notes.set(id, local);
      if (local.updatedAt > remote.updatedAt) toUpload.push(local);
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
  };
}

export function notesFingerprint(notes: Note[]): string {
  return notes
    .map((note) => `${note.id}:${note.updatedAt}`)
    .sort()
    .join("|");
}
