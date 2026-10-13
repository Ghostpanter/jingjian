import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

class StoredImage {
  StoredImage({required this.id, required this.path, required this.name, required this.bytes});
  final String id;
  final String path; // images/<id>.<ext>
  final String name;
  final int bytes;
}

const _extByMime = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
};

String mimeForName(String name) {
  final ext = p.extension(name).toLowerCase();
  for (final e in _extByMime.entries) {
    if (e.value == ext) return e.key;
  }
  if (ext == '.jpeg') return 'image/jpeg';
  return 'image/jpeg';
}

String? sniffImageMime(List<int> b) {
  if (b.length >= 3 && b[0] == 0xff && b[1] == 0xd8) return 'image/jpeg';
  if (b.length >= 8 && b[0] == 0x89 && b[1] == 0x50) return 'image/png';
  if (b.length >= 6 && b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46) return 'image/gif';
  if (b.length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[8] == 0x57 && b[9] == 0x45) {
    return 'image/webp';
  }
  return null;
}

/// Image ids referenced in a note (`images/<id>` or `jingjian-img://<id>`),
/// same rule as the old app's sync-images.ts.
List<String> imageIdsIn(String content) {
  final seen = <String>{};
  final out = <String>[];
  for (final m in RegExp(r'(?:images/|jingjian-img://)([a-z0-9-]+)', caseSensitive: false)
      .allMatches(content)) {
    final id = m.group(1)!;
    if (seen.add(id)) out.add(id);
  }
  return out;
}

class ImageStore {
  ImageStore._();
  static final ImageStore instance = ImageStore._();
  static const _uuid = Uuid();

  Directory? _dir;
  Directory? get dir => _dir;

  Future<void> init() async {
    final docs = await getApplicationDocumentsDirectory();
    _dir = Directory(p.join(docs.path, 'jingjian', 'images'));
    await _dir!.create(recursive: true);
  }

  Future<List<StoredImage>> list() async {
    final out = <StoredImage>[];
    if (_dir == null) return out;
    await for (final entity in _dir!.list()) {
      if (entity is! File) continue;
      final name = p.basename(entity.path);
      final stat = await entity.stat();
      out.add(StoredImage(
        id: p.basenameWithoutExtension(name),
        path: 'images/$name',
        name: name,
        bytes: stat.size,
      ));
    }
    out.sort((a, b) => b.name.compareTo(a.name));
    return out;
  }

  Future<StoredImage> saveBytes(Uint8List data, String originalName, {String? id}) async {
    var ext = p.extension(originalName).toLowerCase();
    if (ext.isEmpty) ext = _extByMime[sniffImageMime(data) ?? 'image/jpeg'] ?? '.jpg';
    final useId = id ?? _uuid.v4().replaceAll('-', '').substring(0, 12);
    final name = '$useId$ext';
    await File(p.join(_dir!.path, name)).writeAsBytes(data, flush: true);
    return StoredImage(id: useId, path: 'images/$name', name: name, bytes: data.length);
  }

  /// Resolve `images/<id>` or `images/<id>.<ext>` to a file, ignoring extension.
  Future<File?> fileFor(String relative) async {
    if (_dir == null) return null;
    final name = relative
        .replaceFirst(RegExp(r'^\./'), '')
        .replaceFirst(RegExp(r'^images/'), '')
        .replaceFirst(RegExp(r'^jingjian-img://'), '');
    final direct = File(p.join(_dir!.path, name));
    if (await direct.exists()) return direct;
    return fileForId(p.basenameWithoutExtension(name));
  }

  File? fileForIdSync(String id) {
    if (_dir == null) return null;
    for (final ext in ['', '.jpg', '.png', '.gif', '.webp', '.svg', '.bmp', '.jpeg']) {
      final f = File(p.join(_dir!.path, '$id$ext'));
      if (f.existsSync()) return f;
    }
    return null;
  }

  Future<File?> fileForId(String id) async => fileForIdSync(id);

  Future<bool> hasId(String id) async => fileForIdSync(id) != null;

  Future<void> delete(String relative) async {
    final file = await fileFor(relative);
    if (file != null) await file.delete();
  }

  String markdownInsert(StoredImage image, {String alt = ''}) =>
      '![${alt.isEmpty ? image.id : alt}](${image.path})';
}
