import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:uuid/uuid.dart';

import 'storage/blob_store.dart';

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

class ImageBlob {
  ImageBlob(this.id, this.name, this.bytes);
  final String id;
  final String name; // <id>.<ext>
  final Uint8List bytes;
  String get mime => sniffImageMime(bytes) ?? mimeForName(name);
}

class ImageStore {
  ImageStore._();
  static final ImageStore instance = ImageStore._();
  static const _uuid = Uuid();

  BlobStore? _blobs;
  // Small cache: keeps the same Uint8List instance for the preview (so the
  // image cache hits) and avoids disk reads on every keystroke.
  final _cache = <String, Uint8List>{};
  var _cacheBytes = 0;

  Uint8List? _read(String name) {
    final hit = _cache.remove(name);
    if (hit != null) {
      _cache[name] = hit;
      return hit;
    }
    final bytes = _blobs?.readSync(name);
    if (bytes == null) return null;
    _cache[name] = bytes;
    _cacheBytes += bytes.length;
    while (_cacheBytes > 64 * 1024 * 1024 && _cache.length > 1) {
      final k = _cache.keys.first;
      _cacheBytes -= _cache.remove(k)!.length;
    }
    return bytes;
  }

  void _forget(String name) {
    final v = _cache.remove(name);
    if (v != null) _cacheBytes -= v.length;
  }

  /// Folder with the image files (Android/desktop only; null on the web).
  String? get localPath => _blobs?.localPath;

  Future<void> init({String? root}) async {
    _blobs = await BlobStore.open('images', root: root);
  }

  Future<List<StoredImage>> list() async {
    final b = _blobs;
    if (b == null) return [];
    final out = [
      for (final name in b.keys)
        StoredImage(id: p.basenameWithoutExtension(name), path: 'images/$name', name: name, bytes: b.sizeOf(name) ?? 0),
    ]..sort((a, b) => b.name.compareTo(a.name));
    return out;
  }

  Future<StoredImage> saveBytes(Uint8List data, String originalName, {String? id}) async {
    var ext = p.extension(originalName).toLowerCase();
    if (!RegExp(r'^\.[a-z0-9]{1,5}$').hasMatch(ext)) ext = '';
    if (ext.isEmpty) ext = _extByMime[sniffImageMime(data) ?? 'image/jpeg'] ?? '.jpg';
    var useId = id ?? _uuid.v4().replaceAll('-', '').substring(0, 12);
    if (!RegExp(r'^[A-Za-z0-9-]{1,80}$').hasMatch(useId)) useId = _uuid.v4().replaceAll('-', '').substring(0, 12);
    final name = '$useId$ext';
    _forget(name);
    await _blobs!.write(name, data);
    return StoredImage(id: useId, path: 'images/$name', name: name, bytes: data.length);
  }

  String? _nameForId(String id) {
    final b = _blobs;
    if (b == null) return null;
    for (final ext in ['', '.jpg', '.png', '.gif', '.webp', '.svg', '.bmp', '.jpeg']) {
      if (b.has('$id$ext')) return '$id$ext';
    }
    return null;
  }

  static String _idOf(String relative) => p.basenameWithoutExtension(relative
      .replaceFirst(RegExp(r'^\./'), '')
      .replaceFirst(RegExp(r'^images/'), '')
      .replaceFirst(RegExp(r'^jingjian-img://'), ''));

  /// Image bytes for `<id>` (any extension), or null.
  ImageBlob? imageSync(String id) {
    final name = _nameForId(id);
    if (name == null) return null;
    final bytes = _read(name);
    return bytes == null ? null : ImageBlob(id, name, bytes);
  }

  /// Resolve `images/<id>.<ext>` / `jingjian-img://<id>`.
  ImageBlob? imageForSrc(String relative) {
    final b = _blobs;
    if (b == null) return null;
    final name = relative.replaceFirst(RegExp(r'^\./'), '').replaceFirst(RegExp(r'^images/'), '');
    if (b.has(name)) {
      final bytes = _read(name);
      if (bytes != null) return ImageBlob(p.basenameWithoutExtension(name), name, bytes);
    }
    return imageSync(_idOf(relative));
  }

  Future<bool> hasId(String id) async => _nameForId(id) != null;

  Future<void> delete(String relative) async {
    final img = imageForSrc(relative);
    if (img != null) {
      _forget(img.name);
      await _blobs!.delete(img.name);
    }
  }

  String markdownInsert(StoredImage image, {String alt = ''}) =>
      '![${alt.isEmpty ? image.id : alt}](${image.path})';
}
