import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:uuid/uuid.dart';

class StoredImage {
  StoredImage({required this.id, required this.path, required this.name, required this.bytes});
  final String id;
  final String path; // images/<id>.ext relative
  final String name;
  final int bytes;
}

class ImageStore {
  ImageStore._();
  static final ImageStore instance = ImageStore._();
  static const _uuid = Uuid();

  Directory? _dir;

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

  Future<StoredImage> saveBytes(Uint8List data, String originalName) async {
    final ext = p.extension(originalName).isEmpty ? '.jpg' : p.extension(originalName);
    final id = _uuid.v4().replaceAll('-', '').substring(0, 12);
    final name = '$id$ext';
    final file = File(p.join(_dir!.path, name));
    await file.writeAsBytes(data);
    return StoredImage(id: id, path: 'images/$name', name: name, bytes: data.length);
  }

  Future<File?> fileFor(String relative) async {
    final name = relative.replaceFirst(RegExp(r'^images/'), '');
    final file = File(p.join(_dir!.path, name));
    return await file.exists() ? file : null;
  }

  Future<void> delete(String relative) async {
    final file = await fileFor(relative);
    if (file != null) await file.delete();
  }

  String markdownInsert(StoredImage image, {String alt = ''}) =>
      '![${alt.isEmpty ? image.name : alt}](${image.path})';
}
