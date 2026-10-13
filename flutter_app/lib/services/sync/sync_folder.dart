import 'dart:io';

import 'package:path/path.dart' as p;

import '../storage/blob_store.dart';

import '../../models/note.dart';
import '../../models/sync_config.dart';
import '../note_file.dart';
import 'sync_adapter.dart';
import 'sync_images.dart';

Future<Directory> _resolveDir(SyncConfig config) async {
  final configured = config.folderPath.trim();
  if (configured.isEmpty) throw Exception('请填写同步文件夹路径');
  if (p.isAbsolute(configured)) {
    final dir = Directory(configured);
    await dir.create(recursive: true);
    return dir;
  }
  final docsPath = await appDataRoot();
  final dir = Directory(p.join(docsPath, 'jingjian', 'sync', configured));
  await dir.create(recursive: true);
  return dir;
}

class _FolderAdapter implements SyncAdapter {
  _FolderAdapter(this.config);
  final SyncConfig config;

  @override
  Future<String> test() async {
    final dir = await _resolveDir(config);
    return '文件夹 ${dir.path} 可用';
  }

  @override
  Future<List<Note>> list() async {
    final dir = await _resolveDir(config);
    final notes = <Note>[];
    await for (final entity in dir.list()) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      if (!RegExp(r'\.(md|markdown|txt)$', caseSensitive: false).hasMatch(name)) continue;
      final raw = decodeUtf8Body(await entity.readAsBytes());
      final idMatch = RegExp(r'\.([a-f0-9]{8})\.(md|txt)$', caseSensitive: false).firstMatch(name);
      final fallback = idMatch?.group(1) ?? name.hashCode.toRadixString(16);
      notes.add(await parseSyncedNote(raw, fallback));
    }
    return notes;
  }

  @override
  Future<void> upsert(Note note) async {
    final dir = await _resolveDir(config);
    final file = File(p.join(dir.path, filenameForNote(note)));
    await file.writeAsString(await serializeNoteWithImages(note));
  }

  @override
  Future<void> remove(String id) async {
    final dir = await _resolveDir(config);
    final short = id.replaceAll('-', '');
    final id8 = short.length >= 8 ? short.substring(0, 8) : short;
    await for (final entity in dir.list()) {
      if (entity is! File) continue;
      if (!p.basename(entity.path).contains(id8)) continue;
      await entity.delete();
    }
  }
}

SyncAdapter createFolderAdapter(SyncConfig config) => _FolderAdapter(config);
