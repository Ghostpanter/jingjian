import 'dart:convert';

import '../../models/note.dart';
import '../../models/sync_config.dart';
import '../note_file.dart';
import 'sync_adapter.dart';
import 'sync_http.dart';
import 'sync_images.dart';

String _encodePath(String path) =>
    path.split('/').map(Uri.encodeComponent).join('/');

String _collectionUrl(SyncConfig config) {
  final root = config.webdavUrl.trim().replaceAll(RegExp(r'/+$'), '');
  final folder = config.webdavPath.trim().replaceAll(RegExp(r'^/+|/+$'), '');
  return folder.isNotEmpty ? '$root/${_encodePath(folder)}/' : '$root/';
}

Map<String, String> _auth(SyncConfig config) => {
      'Authorization': basicAuth(config.webdavUser.trim(), config.webdavPassword),
    };

String _decodeHref(String href) {
  try {
    return Uri.decodeComponent(href);
  } catch (_) {
    return href;
  }
}

List<String> _filenamesFromPropfind(String xml, String collection) {
  final names = <String>{};
  final matches = RegExp(r'<[^>]*href[^>]*>([^<]+)</[^>]*href>', caseSensitive: false).allMatches(xml);
  final collectionPath = Uri.parse(collection).path;
  for (final match in matches) {
    final href = _decodeHref(match.group(1)!.trim());
    final path = href.startsWith('http') ? Uri.parse(href).path : href;
    if (path.endsWith('/')) continue;
    final parts = path.split('/').where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) continue;
    final file = parts.last;
    if (!file.toLowerCase().endsWith('.md')) continue;
    final cleaned = path.replaceAll(RegExp(r'/+$'), '');
    final col = collectionPath.replaceAll(RegExp(r'/+$'), '');
    if (cleaned == col) continue;
    names.add(file);
  }
  return names.toList();
}

Future<String> _ensureCollection(SyncConfig config) async {
  final url = _collectionUrl(config);
  final listed = await syncRequest(
    url,
    method: 'PROPFIND',
    headers: {
      ..._auth(config),
      'Depth': '0',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body:
        '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/></d:prop></d:propfind>',
  );
  if (listed.statusCode == 404) {
    final created = await syncRequest(url, method: 'MKCOL', headers: _auth(config));
    if (created.statusCode != 201 &&
        created.statusCode != 405 &&
        (created.statusCode < 200 || created.statusCode >= 300)) {
      throw Exception('无法创建远程目录，请检查路径与权限');
    }
    return url;
  }
  if (listed.statusCode != 207 &&
      (listed.statusCode < 200 || listed.statusCode >= 300)) {
    throw Exception('WebDAV 无法访问（${listed.statusCode}）');
  }
  return url;
}

class _WebdavAdapter implements SyncAdapter {
  _WebdavAdapter(this.config);
  final SyncConfig config;

  @override
  Future<String> test() async {
    await _ensureCollection(config);
    return 'WebDAV 目录 ${config.webdavPath.isEmpty ? '/' : config.webdavPath} 可用';
  }

  @override
  Future<List<Note>> list() async {
    final url = await _ensureCollection(config);
    final response = await syncRequest(
      url,
      method: 'PROPFIND',
      headers: {
        ..._auth(config),
        'Depth': '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body:
          '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getcontentlength/></d:prop></d:propfind>',
    );
    if (response.statusCode != 207 &&
        (response.statusCode < 200 || response.statusCode >= 300)) {
      throw Exception('列出失败（${response.statusCode}）');
    }
    final names = _filenamesFromPropfind(decodeUtf8Body(response.bodyBytes), url);
    final notes = <Note>[];
    for (final name in names) {
      final fileUrl = '$url${_encodePath(name)}';
      final get = await syncRequest(fileUrl, headers: _auth(config));
      if (get.statusCode < 200 || get.statusCode >= 300) continue;
      final idMatch = RegExp(r'\.([a-f0-9]{8})\.(md|txt)$', caseSensitive: false).firstMatch(name);
      final fallback = idMatch != null
          ? idMatch.group(1)!
          : name.hashCode.toRadixString(16);
      notes.add(await parseSyncedNote(decodeUtf8Body(get.bodyBytes), fallback));
    }
    return notes;
  }

  @override
  Future<void> upsert(Note note) async {
    final url = await _ensureCollection(config);
    final fileUrl = '$url${_encodePath(filenameForNote(note))}';
    final response = await syncRequest(
      fileUrl,
      method: 'PUT',
      headers: {
        ..._auth(config),
        'Content-Type': 'text/markdown; charset=utf-8',
      },
      body: utf8.encode(await serializeNoteWithImages(note)),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('上传失败（${response.statusCode}）');
    }
  }

  @override
  Future<void> remove(String id) async {
    final url = await _ensureCollection(config);
    final response = await syncRequest(
      url,
      method: 'PROPFIND',
      headers: {
        ..._auth(config),
        'Depth': '1',
        'Content-Type': 'application/xml; charset=utf-8',
      },
      body:
          '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/></d:prop></d:propfind>',
    );
    if (response.statusCode != 207) return;
    final short = id.replaceAll('-', '');
    final id8 = short.length >= 8 ? short.substring(0, 8) : short;
    for (final name in _filenamesFromPropfind(decodeUtf8Body(response.bodyBytes), url)) {
      if (!name.contains(id8)) continue;
      await syncRequest('$url${_encodePath(name)}', method: 'DELETE', headers: _auth(config));
    }
  }
}

SyncAdapter createWebdavAdapter(SyncConfig config) => _WebdavAdapter(config);
