import 'dart:io';
import 'dart:typed_data';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';

class BlobStore {
  BlobStore._(this._dir);
  final Directory _dir;
  var _seq = 0;

  /// Local folder backing this store (null on the web).
  String? get localPath => _dir.path;

  static Future<BlobStore> open(String name, {String? root}) async {
    final base = root ?? await appDataRoot();
    final dir = Directory(p.join(base, 'jingjian', name));
    await dir.create(recursive: true);
    return BlobStore._(dir);
  }

  List<String> get keys => [
        for (final f in _dir.listSync().whereType<File>())
          if (!p.basename(f.path).endsWith('.tmp') && !p.basename(f.path).contains('.corrupt-')) p.basename(f.path),
      ];

  bool has(String key) => File(p.join(_dir.path, key)).existsSync();

  Uint8List? readSync(String key) {
    final f = File(p.join(_dir.path, key));
    try {
      return f.readAsBytesSync();
    } catch (_) {
      return null;
    }
  }

  int? sizeOf(String key) {
    try {
      return File(p.join(_dir.path, key)).lengthSync();
    } catch (_) {
      return null;
    }
  }

  /// Atomic: temp file then rename, so a crash never leaves a half file.
  Future<void> write(String key, List<int> data) async {
    final f = File(p.join(_dir.path, key));
    final tmp = File('${f.path}.${++_seq}.tmp');
    await tmp.writeAsBytes(data, flush: true);
    await tmp.rename(f.path);
  }

  Future<void> delete(String key) async {
    final f = File(p.join(_dir.path, key));
    if (await f.exists()) await f.delete();
  }

  /// Keep a damaged entry aside instead of losing it.
  Future<void> quarantine(String key) async {
    final f = File(p.join(_dir.path, key));
    try {
      await f.rename('${f.path}.corrupt-${DateTime.now().millisecondsSinceEpoch}');
    } catch (_) {}
  }
}

/// Documents folder (where 1.8.x always kept data); falls back to the app
/// support folder when the system has no Documents dir (minimal Linux).
Future<String> appDataRoot() async {
  try {
    return (await getApplicationDocumentsDirectory()).path;
  } catch (_) {
    try {
      return (await getApplicationSupportDirectory()).path;
    } catch (_) {
      final home = Platform.environment['HOME'];
      if (home != null && home.isNotEmpty) return p.join(home, '.local', 'share', 'jingjian');
      return Directory.systemTemp.path;
    }
  }
}
