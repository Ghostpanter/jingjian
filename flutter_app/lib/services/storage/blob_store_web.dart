import 'dart:typed_data';

import 'package:idb_shim/idb_browser.dart';

/// IndexedDB-backed store. Everything is mirrored in memory on open, so reads
/// are synchronous like on the file system.
class BlobStore {
  BlobStore._(this._db, this._name, this._cache);
  final Database _db;
  final String _name;
  final Map<String, Uint8List> _cache;
  static const _store = 'blobs';

  String? get localPath => null;

  static Future<BlobStore> open(String name, {String? root}) async {
    final factory = idbFactoryBrowser;
    final db = await factory.open('jingjian.$name.v1', version: 1, onUpgradeNeeded: (e) {
      if (!e.database.objectStoreNames.contains(_store)) e.database.createObjectStore(_store);
    });
    final cache = <String, Uint8List>{};
    final tx = db.transaction(_store, idbModeReadOnly);
    final st = tx.objectStore(_store);
    await for (final c in st.openCursor(autoAdvance: true)) {
      final v = c.value;
      if (v is Uint8List) {
        cache['${c.key}'] = v;
      } else if (v is List) {
        cache['${c.key}'] = Uint8List.fromList(v.cast<int>());
      }
    }
    await tx.completed;
    return BlobStore._(db, name, cache);
  }

  List<String> get keys => _cache.keys.toList();
  bool has(String key) => _cache.containsKey(key);
  Uint8List? readSync(String key) => _cache[key];
  int? sizeOf(String key) => _cache[key]?.length;

  Future<void> write(String key, List<int> data) async {
    final bytes = data is Uint8List ? data : Uint8List.fromList(data);
    final tx = _db.transaction(_store, idbModeReadWrite);
    await tx.objectStore(_store).put(bytes, key);
    await tx.completed;
    _cache[key] = bytes;
  }

  Future<void> delete(String key) async {
    final tx = _db.transaction(_store, idbModeReadWrite);
    await tx.objectStore(_store).delete(key);
    await tx.completed;
    _cache.remove(key);
  }

  Future<void> quarantine(String key) async {
    final v = _cache[key];
    if (v != null) await write('$key.corrupt-${DateTime.now().millisecondsSinceEpoch}', v);
    await delete(key);
  }

  @override
  String toString() => 'BlobStore($_name)';
}

Future<String> appDataRoot() async => '';
