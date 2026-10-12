import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

import '../models/note.dart';

class NoteStore {
  NoteStore._();
  static final NoteStore instance = NoteStore._();

  static const _uuid = Uuid();
  Directory? _dir;
  final List<Note> _notes = [];

  List<Note> get notes =>
      List.unmodifiable(_notes.where((n) => !n.isTrashed).toList()
        ..sort((a, b) => b.updatedAt.compareTo(a.updatedAt)));

  List<Note> get trash =>
      List.unmodifiable(_notes.where((n) => n.isTrashed).toList()
        ..sort((a, b) => (b.trashedAt ?? 0).compareTo(a.trashedAt ?? 0)));

  Future<void> init() async {
    final docs = await getApplicationDocumentsDirectory();
    _dir = Directory(p.join(docs.path, 'jingjian', 'notes'));
    await _dir!.create(recursive: true);
    await _load();
  }

  Future<void> _load() async {
    _notes.clear();
    final files = _dir!
        .listSync()
        .whereType<File>()
        .where((f) => f.path.endsWith('.json'));
    for (final file in files) {
      try {
        final map = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
        _notes.add(Note.fromJson(map));
      } catch (_) {
        // skip corrupt
      }
    }
    if (_notes.isEmpty) {
      await create(
        content: '# 欢迎使用静笺\n\n在左侧新建笔记，右侧预览 Markdown。\n\n'
            '- [ ] 任务列表\n'
            '- **加粗** *斜体*\n\n'
            '\$\$E = mc^2\$\$\n\n'
            '```mermaid\ngraph LR\n  A[编辑] --> B[预览]\n```\n',
      );
    }
  }

  File _fileFor(String id) => File(p.join(_dir!.path, '$id.json'));

  Future<void> _persist(Note note) async {
    await _fileFor(note.id).writeAsString(jsonEncode(note.toJson()));
  }

  Future<Note> create({String content = '', NoteFormat format = NoteFormat.markdown}) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final note = Note(
      id: _uuid.v4(),
      content: content,
      createdAt: now,
      updatedAt: now,
      format: format,
    );
    _notes.add(note);
    await _persist(note);
    return note;
  }

  Future<void> update(Note note) async {
    final i = _notes.indexWhere((n) => n.id == note.id);
    if (i < 0) return;
    _notes[i] = note;
    await _persist(note);
  }

  Future<void> moveToTrash(String id) async {
    final i = _notes.indexWhere((n) => n.id == id);
    if (i < 0) return;
    final next = _notes[i].copyWith(
      trashedAt: DateTime.now().millisecondsSinceEpoch,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );
    _notes[i] = next;
    await _persist(next);
  }

  Future<void> restore(String id) async {
    final i = _notes.indexWhere((n) => n.id == id);
    if (i < 0) return;
    final next = _notes[i].copyWith(
      clearTrash: true,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
    );
    _notes[i] = next;
    await _persist(next);
  }

  Future<void> purge(String id) async {
    _notes.removeWhere((n) => n.id == id);
    final f = _fileFor(id);
    if (await f.exists()) await f.delete();
  }

  Note? byId(String id) {
    try {
      return _notes.firstWhere((n) => n.id == id);
    } catch (_) {
      return null;
    }
  }
}
