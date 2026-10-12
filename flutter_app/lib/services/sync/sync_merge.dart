import '../../models/note.dart';

class MergeInput {
  MergeInput({
    required this.local,
    required this.remote,
    required this.tombstones,
    this.activeId,
    this.now,
    this.protectActive = false,
  });
  final List<Note> local;
  final List<Note> remote;
  final Map<String, int> tombstones;
  final String? activeId;
  final int? now;
  final bool protectActive;
}

class MergeResult {
  MergeResult({
    required this.notes,
    required this.tombstones,
    required this.toUpload,
    required this.toDeleteRemote,
    required this.conflicts,
  });
  final List<Note> notes;
  final Map<String, int> tombstones;
  final List<Note> toUpload;
  final List<String> toDeleteRemote;
  final List<({Note local, Note remote})> conflicts;
}

const _editingWindowMs = 60000;

bool _isEditing(Note local, MergeInput input, int now) {
  if (input.activeId == null || local.id != input.activeId) return false;
  if (input.protectActive) return true;
  return now - local.updatedAt < _editingWindowMs;
}

Note _withLatestProgress(Note winner, Note local, Note remote) {
  return winner.copyWith(
    readAt: _maxNullable(local.readAt, remote.readAt),
    readRatio: (local.readAt ?? 0) >= (remote.readAt ?? 0)
        ? local.readRatio
        : remote.readRatio,
    openedAt: _maxNullable(local.openedAt, remote.openedAt),
    starred: (local.starredAt ?? 0) >= (remote.starredAt ?? 0) ? local.starred : remote.starred,
    starredAt: _maxNullable(local.starredAt, remote.starredAt),
    trashedAt: _maxNullable(local.trashedAt, remote.trashedAt),
    restoredAt: _maxNullable(local.restoredAt, remote.restoredAt),
  );
}

int? _maxNullable(int? a, int? b) {
  if (a == null) return b;
  if (b == null) return a;
  return a >= b ? a : b;
}

bool _marksAhead(Note local, Note remote) {
  return (local.readAt ?? 0) > (remote.readAt ?? 0) ||
      (local.openedAt ?? 0) > (remote.openedAt ?? 0) ||
      (local.starredAt ?? 0) > (remote.starredAt ?? 0) ||
      (local.trashedAt ?? 0) > (remote.trashedAt ?? 0) ||
      (local.restoredAt ?? 0) > (remote.restoredAt ?? 0);
}

String mergeNoteContent(String local, String remote) {
  if (local == remote) return local;
  if (local.trim().isEmpty) return remote;
  if (remote.trim().isEmpty) return local;
  if (local.startsWith(remote) || local.contains(remote)) return local;
  if (remote.startsWith(local) || remote.contains(local)) return remote;
  return local;
}

MergeResult mergeNotes(MergeInput input) {
  final localMap = {for (final n in input.local) n.id: n};
  final remoteMap = {for (final n in input.remote) n.id: n};
  final tombstones = Map<String, int>.from(input.tombstones);
  final notes = <String, Note>{};
  final toUpload = <Note>[];
  final toDeleteRemote = <String>[];
  final conflicts = <({Note local, Note remote})>[];
  final seen = <String>{};
  final now = input.now ?? DateTime.now().millisecondsSinceEpoch;

  for (final entry in remoteMap.entries) {
    final id = entry.key;
    final remote = entry.value;
    seen.add(id);
    final deletedAt = tombstones[id];
    if (deletedAt != null) {
      if (remote.updatedAt > deletedAt) {
        notes[id] = remote;
        tombstones.remove(id);
      } else {
        toDeleteRemote.add(id);
      }
      continue;
    }
    final local = localMap[id];
    if (local == null) {
      notes[id] = remote;
      continue;
    }
    if (local.content == remote.content) {
      final winner = local.updatedAt >= remote.updatedAt ? local : remote;
      final merged = _withLatestProgress(winner, local, remote);
      notes[id] = merged;
      if (_marksAhead(local, remote)) toUpload.add(merged);
      continue;
    }
    if (_isEditing(local, input, now)) {
      final merged = _withLatestProgress(local, local, remote);
      notes[id] = merged;
      toUpload.add(merged);
      continue;
    }
    if (local.content != remote.content &&
        !local.content.contains(remote.content) &&
        !remote.content.contains(local.content)) {
      notes[id] = _withLatestProgress(local, local, remote);
      conflicts.add((local: local, remote: remote));
      continue;
    }
    if (local.updatedAt > remote.updatedAt) {
      final merged = _withLatestProgress(local, local, remote);
      notes[id] = merged;
      toUpload.add(merged);
      continue;
    }
    if (remote.updatedAt > local.updatedAt) {
      if (local.content.startsWith(remote.content) || local.content.contains(remote.content)) {
        final merged = _withLatestProgress(local, local, remote);
        notes[id] = merged;
        toUpload.add(merged);
      } else {
        final merged = _withLatestProgress(remote, local, remote);
        notes[id] = merged;
        if (_marksAhead(local, remote)) toUpload.add(merged);
      }
      continue;
    }
    final mergedContent = mergeNoteContent(local.content, remote.content);
    final next = _withLatestProgress(
      local.copyWith(content: mergedContent),
      local,
      remote,
    );
    notes[id] = next;
    if (mergedContent != remote.content || _marksAhead(local, remote)) {
      toUpload.add(next);
    }
  }

  for (final entry in localMap.entries) {
    if (seen.contains(entry.key)) continue;
    if (tombstones.containsKey(entry.key)) continue;
    notes[entry.key] = entry.value;
    toUpload.add(entry.value);
  }

  final list = notes.values.toList()..sort((a, b) => b.updatedAt.compareTo(a.updatedAt));
  return MergeResult(
    notes: list,
    tombstones: tombstones,
    toUpload: toUpload,
    toDeleteRemote: toDeleteRemote,
    conflicts: conflicts,
  );
}

String notesFingerprint(List<Note> notes) {
  final parts = notes
      .map((n) =>
          '${n.id}:${n.updatedAt}:${n.readAt ?? 0}:${n.openedAt ?? 0}:${n.starredAt ?? 0}:${n.starred ? 1 : 0}:${n.trashedAt ?? 0}:${n.restoredAt ?? 0}')
      .toList()
    ..sort();
  return parts.join('|');
}
