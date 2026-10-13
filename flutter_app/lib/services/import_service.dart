import 'ebook_service.dart';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:uuid/uuid.dart';

import '../models/note.dart';
import 'folder_tree.dart';
import 'image_store.dart';
import 'note_store.dart';
import 'sync/sync_images.dart';

/// Import .md/.markdown/.txt files or a .zip (folder export from old/new app).
class ImportService {
  ImportService._();
  static final ImportService instance = ImportService._();
  static const _uuid = Uuid();

  bool isNoteName(String name) => RegExp(r'\.(md|markdown|txt)$', caseSensitive: false).hasMatch(name);

  Future<int> importFile(String name, Uint8List bytes, {String? folder}) async {
    if (name.toLowerCase().endsWith('.zip')) return importZip(bytes, folder: folder);
    if (!isNoteName(name)) return 0;
    await _importText(name, EbookService.instance.decodeBytes(bytes), folder);
    return 1;
  }

  Future<void> _importText(String path, String raw, String? folder) async {
    final split = splitImageTrailer(raw);
    final parsed = await parseSyncedNote(raw, _uuid.v4());
    final store = NoteStore.instance;
    final dir = path.contains('/') ? path.substring(0, path.lastIndexOf('/')) : '';
    final targetFolder = normalizeFolder([folder ?? '', parsed.folder ?? dir].where((s) => s.isNotEmpty).join('/'));
    final isTxt = path.toLowerCase().endsWith('.txt');
    // Keep the original id only if it does not clash with an existing note.
    final keepId = split.content.startsWith('---') && store.byId(parsed.id) == null;
    final note = Note(
      id: keepId ? parsed.id : _uuid.v4(),
      content: parsed.content,
      createdAt: parsed.createdAt,
      updatedAt: DateTime.now().millisecondsSinceEpoch,
      format: isTxt ? NoteFormat.txt : parsed.format,
      folder: targetFolder.isEmpty ? null : targetFolder,
      bookId: parsed.bookId,
      bookTitle: parsed.bookTitle,
      bookAuthor: parsed.bookAuthor,
      chapterIndex: parsed.chapterIndex,
      starred: parsed.starred,
      starredAt: parsed.starredAt,
    );
    await store.insert(note);
  }

  Future<int> importZip(Uint8List bytes, {String? folder}) async {
    final archive = ZipDecoder().decodeBytes(bytes);
    var count = 0;
    for (final f in archive.files) {
      if (!f.isFile) continue;
      final name = f.name.replaceAll('\\', '/');
      if (name.startsWith('__MACOSX/') || name.split('/').last.startsWith('.')) continue;
      final data = Uint8List.fromList(f.content as List<int>);
      if (RegExp(r'(^|/)images/[^/]+\.(png|jpe?g|gif|webp|svg|bmp)$', caseSensitive: false).hasMatch(name)) {
        final file = name.split('/').last;
        final id = file.replaceAll(RegExp(r'\.[^.]+$'), '');
        if (!await ImageStore.instance.hasId(id)) {
          await ImageStore.instance.saveBytes(data, file, id: id);
        }
        continue;
      }
      if (!isNoteName(name)) continue;
      await _importText(name, EbookService.instance.decodeBytes(data), folder);
      count++;
    }
    return count;
  }
}
