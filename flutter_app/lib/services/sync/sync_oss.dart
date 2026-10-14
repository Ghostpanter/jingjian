import 'dart:convert';

import '../../models/note.dart';
import '../../models/sync_config.dart';
import '../note_file.dart';
import 's3_sign.dart';
import 'sync_adapter.dart';
import 'sync_http.dart';
import 'sync_images.dart';

String endpointForVendor(OssVendor vendor, String region) {
  final r = region.trim();
  switch (vendor) {
    case OssVendor.aliyun:
      return 'oss-${r.isEmpty ? 'cn-hangzhou' : r}.aliyuncs.com';
    case OssVendor.tencent:
      return 'cos.${r.isEmpty ? 'ap-guangzhou' : r}.myqcloud.com';
    case OssVendor.huawei:
      return 'obs.${r.isEmpty ? 'cn-north-4' : r}.myhuaweicloud.com';
    case OssVendor.qiniu:
      return 's3.${r.isEmpty ? 'cn-east-1' : r}.qiniucs.com';
    case OssVendor.volcengine:
      return 'tos-${r.isEmpty ? 'cn-beijing' : r}.volces.com';
    case OssVendor.aws:
      return r.isEmpty || r == 'us-east-1' ? 's3.amazonaws.com' : 's3.$r.amazonaws.com';
    case OssVendor.minio:
      return '';
  }
}

String _normalizeEndpoint(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) throw Exception('请填写 Endpoint');
  final withScheme = RegExp(r'^https?://', caseSensitive: false).hasMatch(trimmed)
      ? trimmed
      : 'https://$trimmed';
  return withScheme.replaceAll(RegExp(r'/+$'), '');
}

bool _usesPathStyle(SyncConfig config) {
  if (config.ossPathStyle) return true;
  try {
    final host = Uri.parse(_normalizeEndpoint(config.ossEndpoint)).host;
    return host == 'localhost' || host.startsWith('127.') || host.endsWith('.local');
  } catch (_) {
    return true;
  }
}

String _bucketUrl(SyncConfig config) {
  final bucket = config.ossBucket.trim();
  if (bucket.isEmpty) throw Exception('请填写 Bucket 名称');
  final endpoint = _normalizeEndpoint(config.ossEndpoint);
  if (_usesPathStyle(config)) return '$endpoint/$bucket';
  final url = Uri.parse(endpoint);
  return '${url.scheme}://$bucket.${url.host}${url.hasPort ? ':${url.port}' : ''}';
}

String _objectKey(SyncConfig config, String filename) {
  final prefix = config.ossPrefix.trim().replaceAll(RegExp(r'^/+|/+$'), '');
  return prefix.isEmpty ? filename : '$prefix/$filename';
}

String _objectUrl(SyncConfig config, String key) =>
    '${_bucketUrl(config)}/${encodeS3Path(key)}';

Future<Map<String, String>> _signedHeaders(
  SyncConfig config, {
  required String method,
  required String url,
  List<int>? body,
  Map<String, String>? extra,
}) {
  return signS3Request(
    method: method,
    url: url,
    headers: extra,
    body: body,
    accessKey: config.ossAccessKey.trim(),
    secretKey: config.ossSecretKey.trim(),
    region: config.ossRegion,
  );
}

class _OssAdapter implements SyncAdapter {
  _OssAdapter(this.config);
  final SyncConfig config;

  @override
  Future<String> test() async {
    final prefix = config.ossPrefix.trim().replaceAll(RegExp(r'^/+|/+$'), '');
    final query = 'list-type=2&max-keys=1${prefix.isEmpty ? '' : '&prefix=${rfc3986('$prefix/')}'}';
    final url = '${_bucketUrl(config)}?$query';
    final headers = await _signedHeaders(config, method: 'GET', url: url);
    final response = await syncRequest(url, headers: headers);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(syncHttpError('OSS', response.statusCode));
    }
    return 'OSS Bucket ${config.ossBucket} 可用';
  }

  @override
  Future<List<Note>> list() async {
    final prefix = config.ossPrefix.trim().replaceAll(RegExp(r'^/+|/+$'), '');
    // ListObjectsV2 returns at most 1000 keys per page; follow the
    // continuation token so libraries with >1000 notes are complete.
    final keys = <String>[];
    String? token;
    for (var page = 0; page < 100; page++) {
      final params = <String>[
        if (token != null) 'continuation-token=${rfc3986(token)}',
        'list-type=2',
        'max-keys=1000',
        if (prefix.isNotEmpty) 'prefix=${rfc3986('$prefix/')}',
      ];
      final url = '${_bucketUrl(config)}?${params.join('&')}';
      final headers = await _signedHeaders(config, method: 'GET', url: url);
      final response = await syncRequest(url, headers: headers);
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(syncHttpError('OSS', response.statusCode));
      }
      final pageResult = parseListObjectsV2(decodeUtf8Body(response.bodyBytes));
      keys.addAll(pageResult.keys.where((k) => RegExp(r'\.(md|markdown|txt)$', caseSensitive: false).hasMatch(k)));
      token = pageResult.nextToken;
      if (token == null) break;
    }
    final notes = <Note>[];
    for (final key in keys) {
      final objUrl = _objectUrl(config, key);
      final hdrs = await _signedHeaders(config, method: 'GET', url: objUrl);
      final get = await syncRequest(objUrl, headers: hdrs);
      if (get.statusCode < 200 || get.statusCode >= 300) continue;
      final name = key.split('/').last;
      final idMatch = RegExp(r'\.([a-f0-9]{8})\.(md|txt)$', caseSensitive: false).firstMatch(name);
      notes.add(await parseSyncedNote(decodeUtf8Body(get.bodyBytes), idMatch?.group(1) ?? name.hashCode.toRadixString(16)));
    }
    return notes;
  }

  @override
  Future<void> upsert(Note note) async {
    final key = _objectKey(config, filenameForNote(note));
    final url = _objectUrl(config, key);
    final body = utf8.encode(await serializeNoteWithImages(note));
    final headers = await _signedHeaders(
      config,
      method: 'PUT',
      url: url,
      body: body,
      extra: {'content-type': 'text/markdown; charset=utf-8'},
    );
    final response = await syncRequest(url, method: 'PUT', headers: headers, body: body);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception(syncHttpError('OSS', response.statusCode));
    }
  }

  @override
  Future<void> remove(String id) async {
    final remote = await list();
    for (final note in remote) {
      if (note.id != id) continue;
      final key = _objectKey(config, filenameForNote(note));
      final url = _objectUrl(config, key);
      final headers = await _signedHeaders(config, method: 'DELETE', url: url);
      await syncRequest(url, method: 'DELETE', headers: headers);
    }
  }
}

SyncAdapter createOssAdapter(SyncConfig config) => _OssAdapter(config);


String _xmlUnescape(String s) => s
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&');

/// Keys and the next continuation token (null when not truncated).
({List<String> keys, String? nextToken}) parseListObjectsV2(String xml) {
  final keys = [for (final m in RegExp(r'<Key>([^<]+)</Key>').allMatches(xml)) _xmlUnescape(m.group(1)!)];
  final truncated = RegExp(r'<IsTruncated>\s*true\s*</IsTruncated>').hasMatch(xml);
  final token = RegExp(r'<NextContinuationToken>([^<]+)</NextContinuationToken>').firstMatch(xml)?.group(1);
  return (keys: keys, nextToken: truncated && token != null ? _xmlUnescape(token) : null);
}
