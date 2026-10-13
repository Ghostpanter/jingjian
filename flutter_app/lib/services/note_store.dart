import 'dart:convert';

import 'package:uuid/uuid.dart';

import '../models/note.dart';
import 'app_prefs.dart';
import 'folder_tree.dart';
import 'storage/blob_store.dart';

class NoteStore {
  NoteStore._();
  static final NoteStore instance = NoteStore._();

  static const _uuid = Uuid();
  BlobStore? _blobs;
  final List<Note> _notes = [];
  final List<String> _extraFolders = [];

  List<String> get extraFolders => List.unmodifiable(_extraFolders);

  List<Note> get allNotes => List.unmodifiable(_notes);

  List<Note> get notes =>
      List.unmodifiable(_notes.where((n) => !n.isTrashed).toList()
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt)));

  List<Note> get trash =>
      List.unmodifiable(_notes.where((n) => n.isTrashed).toList()
        ..sort((a, b) => (b.trashedAt ?? 0).compareTo(a.trashedAt ?? 0)));

  Future<void> init({String? root}) async {
    _blobs = await BlobStore.open('notes', root: root);
    _extraFolders
      ..clear()
      ..addAll(AppPrefs.instance.readExtraFolders());
    await _load();
  }

  Future<void> _load() async {
    _notes.clear();
    final blobs = _blobs!;
    for (final key in blobs.keys.where((k) => k.endsWith('.json'))) {
      try {
        final map = jsonDecode(utf8.decode(blobs.readSync(key)!)) as Map<String, dynamic>;
        _notes.add(Note.fromJson(map));
      } catch (_) {
        await blobs.quarantine(key);
      }
    }
    if (_notes.isEmpty) {
      await create(
        content: '# 欢迎使用静笺\n\n在左侧新建笔记，右侧预览 Markdown。\n\n'
            '- [ ] 任务列表\n'
            '- **加粗** *斜体*\n\n'
            r'$$E = mc^2$$'
            '\n\n'
            '使用 [[欢迎使用静笺]] 双向链接。\n\n'
            '```mermaid\ngraph LR\n  A[编辑] --> B[预览]\n```\n',
      );
    }
  }

  /// File name for a note. Ids that are not plain (e.g. from a hand-made sync
  /// file) are encoded so they can never escape the notes folder.
  static String keyFor(String id) => RegExp(r'^[A-Za-z0-9_-]{1,100}$').hasMatch(id)
      ? '$id.json'
      : 'x-${base64Url.encode(utf8.encode(id)).replaceAll('=', '')}.json';
  String _key(String id) => keyFor(id);

  Future<void> _persist(Note note) => _blobs!.write(_key(note.id), utf8.encode(jsonEncode(note.toJson())));

  Future<Note> create({
    String content = '',
    NoteFormat format = NoteFormat.markdown,
    String? folder,
  }) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final note = Note(
      id: _uuid.v4(),
      content: content,
      createdAt: now,
      updatedAt: now,
      format: format,
      folder: folder != null && folder.isNotEmpty ? normalizeFolder(folder) : null,
    );
    _notes.add(note);
    await _persist(note);
    return note;
  }

  Future<void> insert(Note note) async {
    _notes.removeWhere((n) => n.id == note.id);
    _notes.add(note);
    await _persist(note);
  }

  Future<void> update(Note note) async {
    final i = _notes.indexWhere((n) => n.id == note.id);
    if (i < 0) return;
    _notes[i] = note;
    await _persist(note);
  }

  Future<void> replaceAll(List<Note> notes) async {
    final keep = notes.map((n) => n.id).toSet();
    for (final existing in List<Note>.from(_notes)) {
      if (!keep.contains(existing.id)) {
        await _blobs!.delete(_key(existing.id));
      }
    }
    _notes
      ..clear()
      ..addAll(notes);
    for (final note in _notes) {
      await _persist(note);
    }
  }

  Future<void> moveToTrash(String id) async {
    final i = _notes.indexWhere((n) => n.id == id);
    if (i < 0) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final next = _notes[i].copyWith(trashedAt: now, updatedAt: now);
    _notes[i] = next;
    await _persist(next);
  }

  Future<void> restore(String id) async {
    final i = _notes.indexWhere((n) => n.id == id);
    if (i < 0) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    final next = _notes[i].copyWith(restoredAt: now, updatedAt: now);
    _notes[i] = next;
    await _persist(next);
  }

  Future<void> purge(String id) async {
    _notes.removeWhere((n) => n.id == id);
    await _blobs!.delete(_key(id));
    final tombs = AppPrefs.instance.readTombstones();
    tombs[id] = DateTime.now().millisecondsSinceEpoch;
    await AppPrefs.instance.writeTombstones(tombs);
  }

  Future<void> setFolder(String id, String? folder) async {
    final note = byId(id);
    if (note == null) return;
    final updated = Note(
      id: note.id,
      content: note.content,
      createdAt: note.createdAt,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
      trashedAt: note.trashedAt,
      restoredAt: note.restoredAt,
      format: note.format,
      folder: folder == null || folder.isEmpty ? null : normalizeFolder(folder),
      bookId: note.bookId,
      bookTitle: note.bookTitle,
      bookAuthor: note.bookAuthor,
      bookCover: note.bookCover,
      chapterIndex: note.chapterIndex,
      readRatio: note.readRatio,
      readAt: note.readAt,
      starred: note.starred,
      starredAt: note.starredAt,
      openedAt: note.openedAt,
    );
    await update(updated);
  }

  Future<void> toggleStar(String id) async {
    final note = byId(id);
    if (note == null) return;
    final now = DateTime.now().millisecondsSinceEpoch;
    await update(note.copyWith(starred: !note.starred, starredAt: now));
  }

  Future<void> addExtraFolder(String path) async {
    final n = normalizeFolder(path);
    if (n.isEmpty || _extraFolders.contains(n)) return;
    _extraFolders.add(n);
    await AppPrefs.instance.writeExtraFolders(_extraFolders);
  }

  Future<void> removeExtraFolder(String path) async {
    _extraFolders.remove(normalizeFolder(path));
    await AppPrefs.instance.writeExtraFolders(_extraFolders);
  }

  Note? byId(String id) {
    try {
      return _notes.firstWhere((n) => n.id == id);
    } catch (_) {
      return null;
    }
  }

  bool _inFolder(String? folder, String path) =>
      folder != null && (folder == path || folder.startsWith('$path/'));

  /// Rename/move a folder (and its subfolders).
  Future<int> renameFolder(String from, String to) async {
    final a = normalizeFolder(from), b = normalizeFolder(to);
    if (a.isEmpty || b.isEmpty || a == b) return 0;
    if (b.startsWith('$a/')) throw Exception('不能把文件夹移到它自己的子文件夹里');
    var n = 0;
    final now = DateTime.now().millisecondsSinceEpoch;
    for (final note in List<Note>.from(_notes)) {
      if (_inFolder(note.folder, a)) {
        await update(note.copyWith(folder: b + note.folder!.substring(a.length), updatedAt: now));
        n++;
      }
    }
    final extras = List<String>.from(_extraFolders);
    for (final e in extras) {
      if (_inFolder(e, a)) {
        await removeExtraFolder(e);
        await addExtraFolder(b + e.substring(a.length));
      }
    }
    return n;
  }

  /// Move every note of a folder to trash and forget the folder.
  Future<int> trashFolder(String path) async {
    final a = normalizeFolder(path);
    var n = 0;
    for (final note in List<Note>.from(_notes)) {
      if (!note.isTrashed && _inFolder(note.folder, a)) {
        await moveToTrash(note.id);
        n++;
      }
    }
    for (final e in List<String>.from(_extraFolders)) {
      if (_inFolder(e, a)) await removeExtraFolder(e);
    }
    return n;
  }
}
