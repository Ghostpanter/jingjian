import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import 'image_store.dart';

/// Port of old app image-config.ts / image-upload.ts / image-insert.ts.
/// Same storage key + JSON field names so settings exported from the old
/// app (localStorage `jingjian.image.v1`) mean the same thing here.
enum ImageInsertAction { none, copy, upload }

enum ImageUploader { none, github, gitee, smms, lsky, imgur, picgo, custom }

const imageUploaderLabels = {
  ImageUploader.none: '不上传',
  ImageUploader.github: 'GitHub',
  ImageUploader.gitee: 'Gitee',
  ImageUploader.smms: 'SM.MS',
  ImageUploader.lsky: '兰空图床 Lsky Pro',
  ImageUploader.imgur: 'Imgur',
  ImageUploader.picgo: 'PicGo（本机服务）',
  ImageUploader.custom: '自定义接口',
};

class ImageConfig {
  ImageInsertAction insertAction = ImageInsertAction.none;
  bool applyToLocal = true;
  bool applyToRemote = false;
  bool preferRelative = true;
  bool relativeDotSlash = false;
  bool escapeUrl = false;

  /// Flutter addition: when uploading, also keep a copy in the local 图片库.
  bool keepLocalCopy = true;
  ImageUploader uploader = ImageUploader.none;
  String githubToken = '', githubRepo = '', githubBranch = 'main', githubPath = 'jingjian';
  String githubLink = 'jsdelivr', githubDomain = '';
  String giteeToken = '', giteeRepo = '', giteeBranch = 'master', giteePath = 'jingjian';
  String smmsToken = '';
  String lskyUrl = '', lskyToken = '';
  String imgurClientId = '';
  String picgoUrl = 'http://127.0.0.1:36677/upload';
  String customUrl = '', customToken = '', customFileField = 'file', customUrlPath = 'data.url';

  bool get uploads => insertAction == ImageInsertAction.upload && uploader != ImageUploader.none;

  Map<String, dynamic> toJson() => {
        'insertAction': insertAction.name,
        'applyToLocal': applyToLocal,
        'applyToRemote': applyToRemote,
        'yamlUpload': false,
        'preferRelative': preferRelative,
        'relativeDotSlash': relativeDotSlash,
        'escapeUrl': escapeUrl,
        'keepLocalCopy': keepLocalCopy,
        'uploader': uploader.name,
        'githubToken': githubToken,
        'githubRepo': githubRepo,
        'githubBranch': githubBranch,
        'githubPath': githubPath,
        'githubLink': githubLink,
        'githubDomain': githubDomain,
        'giteeToken': giteeToken,
        'giteeRepo': giteeRepo,
        'giteeBranch': giteeBranch,
        'giteePath': giteePath,
        'smmsToken': smmsToken,
        'lskyUrl': lskyUrl,
        'lskyToken': lskyToken,
        'imgurClientId': imgurClientId,
        'picgoUrl': picgoUrl,
        'customUrl': customUrl,
        'customToken': customToken,
        'customFileField': customFileField,
        'customUrlPath': customUrlPath,
      };

  static ImageConfig fromJson(Map<String, dynamic> j) {
    String s(String k, String d) => j[k] is String ? j[k] as String : d;
    final c = ImageConfig();
    c.insertAction = ImageInsertAction.values.firstWhere((e) => e.name == j['insertAction'], orElse: () => ImageInsertAction.none);
    c.uploader = ImageUploader.values.firstWhere((e) => e.name == j['uploader'], orElse: () => ImageUploader.none);
    c.applyToLocal = j['applyToLocal'] != false;
    c.applyToRemote = j['applyToRemote'] == true;
    c.preferRelative = j['preferRelative'] != false;
    c.relativeDotSlash = j['relativeDotSlash'] == true;
    c.escapeUrl = j['escapeUrl'] == true;
    c.keepLocalCopy = j['keepLocalCopy'] != false;
    c.githubToken = s('githubToken', '');
    c.githubRepo = s('githubRepo', '');
    c.githubBranch = s('githubBranch', 'main');
    c.githubPath = s('githubPath', 'jingjian');
    final link = s('githubLink', 'jsdelivr');
    c.githubLink = link == 'raw' || link == 'custom' ? link : 'jsdelivr';
    c.githubDomain = s('githubDomain', '');
    c.giteeToken = s('giteeToken', '');
    c.giteeRepo = s('giteeRepo', '');
    c.giteeBranch = s('giteeBranch', 'master');
    c.giteePath = s('giteePath', 'jingjian');
    c.smmsToken = s('smmsToken', '');
    c.lskyUrl = s('lskyUrl', '');
    c.lskyToken = s('lskyToken', '');
    c.imgurClientId = s('imgurClientId', '');
    c.picgoUrl = s('picgoUrl', 'http://127.0.0.1:36677/upload');
    c.customUrl = s('customUrl', '');
    c.customToken = s('customToken', '');
    c.customFileField = s('customFileField', 'file');
    c.customUrlPath = s('customUrlPath', 'data.url');
    return c;
  }

  ImageConfig copy() => fromJson(toJson());
}

const _key = 'jingjian.image.v1';

Future<ImageConfig> readImageConfig() async {
  final p = await SharedPreferences.getInstance();
  final raw = p.getString(_key);
  if (raw == null) return ImageConfig();
  try {
    return ImageConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  } catch (_) {
    return ImageConfig();
  }
}

Future<void> writeImageConfig(ImageConfig c) async {
  final p = await SharedPreferences.getInstance();
  await p.setString(_key, jsonEncode(c.toJson()));
}

String formatImageSrc(String path, ImageConfig c) {
  var src = path.replaceFirst(RegExp(r'^\./'), '');
  if (c.preferRelative && !src.startsWith('http') && !src.startsWith('/')) {
    src = c.relativeDotSlash ? './$src' : src;
  }
  return c.escapeUrl ? Uri.encodeFull(src) : src;
}

Map<String, dynamic>? _rec(Object? v) => v is Map ? v.cast<String, dynamic>() : null;
String _str(Object? v, [String d = '']) => v is String ? v : d;

/// Import Typora / PicGo `data.json` (or its `picBed` object).
ImageConfig applyPicgoConfig(String raw, ImageConfig current) {
  final root = _rec(jsonDecode(raw));
  if (root == null) throw Exception('不是有效的 PicGo 配置');
  final bed = _rec(root['picBed']) ?? root;
  final currentName = _str(bed['current'] ?? bed['uploader']).toLowerCase();
  final n = current.copy()..insertAction = ImageInsertAction.upload;
  final gh = _rec(bed['github']);
  if (gh != null) {
    n.githubRepo = _str(gh['repo'], n.githubRepo);
    n.githubToken = _str(gh['token'], n.githubToken);
    n.githubPath = _str(gh['path'], n.githubPath).replaceAll(RegExp(r'/+$'), '');
    n.githubBranch = _str(gh['branch'], n.githubBranch).isEmpty ? 'main' : _str(gh['branch'], n.githubBranch);
    final cu = _str(gh['customUrl']);
    if (cu.isNotEmpty) {
      n.githubLink = 'custom';
      n.githubDomain = cu.replaceAll(RegExp(r'/+$'), '');
    }
  }
  final ge = _rec(bed['gitee']);
  if (ge != null) {
    n.giteeRepo = _str(ge['repo'], n.giteeRepo);
    n.giteeToken = _str(ge['token'], n.giteeToken);
    n.giteePath = _str(ge['path'], n.giteePath).replaceAll(RegExp(r'/+$'), '');
    n.giteeBranch = _str(ge['branch'], n.giteeBranch).isEmpty ? 'master' : _str(ge['branch'], n.giteeBranch);
  }
  final sm = _rec(bed['smms']);
  if (sm != null) n.smmsToken = _str(sm['token'], n.smmsToken);
  final ls = _rec(bed['lskyPro']) ?? _rec(bed['lsky']);
  if (ls != null) {
    n.lskyUrl = _str(ls['serverUrl'] ?? ls['url'], n.lskyUrl);
    n.lskyToken = _str(ls['token'], n.lskyToken);
  }
  final im = _rec(bed['imgur']);
  if (im != null) n.imgurClientId = _str(im['clientId'] ?? im['client_id'], n.imgurClientId);
  final cus = _rec(bed['webhook']) ?? _rec(bed['custom']) ?? _rec(bed['github-plus']);
  final cusUrl = cus == null ? '' : _str(cus['url']).isNotEmpty ? _str(cus['url']) : _str(cus['endpoint']);
  if (cus != null && cusUrl.isNotEmpty) {
    n.customUrl = cusUrl;
    n.customToken = _str(cus['token']).isNotEmpty ? _str(cus['token']) : _str(cus['authorization'], n.customToken);
    n.customFileField = _str(cus['fileName']).isNotEmpty ? _str(cus['fileName']) : _str(cus['field'], n.customFileField);
    n.customUrlPath = _str(cus['jsonPath'], n.customUrlPath);
  }
  const map = {
    'github': ImageUploader.github,
    'gitee': ImageUploader.gitee,
    'smms': ImageUploader.smms,
    'lsky': ImageUploader.lsky,
    'lskypro': ImageUploader.lsky,
    'imgur': ImageUploader.imgur,
    'webhook': ImageUploader.custom,
    'custom': ImageUploader.custom,
  };
  if (map.containsKey(currentName)) {
    n.uploader = map[currentName]!;
  } else if (gh != null && (n.githubToken.isNotEmpty || n.githubRepo.isNotEmpty)) {
    n.uploader = ImageUploader.github;
  } else if (sm != null && n.smmsToken.isNotEmpty) {
    n.uploader = ImageUploader.smms;
  } else if (ls != null && (n.lskyUrl.isNotEmpty || n.lskyToken.isNotEmpty)) {
    n.uploader = ImageUploader.lsky;
  } else if (im != null && n.imgurClientId.isNotEmpty) {
    n.uploader = ImageUploader.imgur;
  } else if (ge != null && (n.giteeToken.isNotEmpty || n.giteeRepo.isNotEmpty)) {
    n.uploader = ImageUploader.gitee;
  }
  if (n.uploader == ImageUploader.none) throw Exception('PicGo 配置里没有可用的图床');
  return n;
}

Object? readJsonPath(Object? payload, String path) {
  if (path.trim().isEmpty) return payload;
  Object? cur = payload;
  for (final key in path.replaceAllMapped(RegExp(r'\[(\d+)\]'), (m) => '.${m[1]}').split('.').where((k) => k.isNotEmpty)) {
    if (cur == null) return null;
    if (cur is List) {
      final i = int.tryParse(key);
      cur = i != null && i >= 0 && i < cur.length ? cur[i] : null;
    } else if (cur is Map) {
      cur = cur[key];
    } else {
      return null;
    }
  }
  return cur;
}

String pickImageUrl(Object? payload, String path) {
  final candidates = [
    readJsonPath(payload, path),
    readJsonPath(payload, 'url'),
    readJsonPath(payload, 'data.url'),
    readJsonPath(payload, 'data.link'),
    readJsonPath(payload, 'data.links.url'),
    readJsonPath(payload, 'result.0'),
    readJsonPath(payload, 'result'),
  ];
  for (final v in candidates) {
    if (v is String && RegExp(r'^https?://', caseSensitive: false).hasMatch(v)) return v;
    if (v is List && v.isNotEmpty && v.first is String) return v.first as String;
  }
  throw Exception('图床没有返回图片地址');
}

({String owner, String name}) _repoParts(String repo) {
  final parts = repo.trim().replaceFirst(RegExp(r'^https?://(github|gitee)\.com/', caseSensitive: false), '').split('/');
  if (parts.length < 2 || parts[0].isEmpty || parts[1].isEmpty) throw Exception('仓库写成 owner/repo');
  return (owner: parts[0], name: parts[1].replaceFirst(RegExp(r'\.git$'), ''));
}

String _join(List<String> parts) =>
    parts.map((p) => p.replaceAll(RegExp(r'^/+|/+$'), '')).where((p) => p.isNotEmpty).join('/');

String datedImageName(String filename, String folder, [DateTime? now]) {
  final d = now ?? DateTime.now();
  final ext = filename.contains('.') ? filename.split('.').last : 'jpg';
  final month = '${d.year}/${d.month.toString().padLeft(2, '0')}';
  var safe = filename.replaceAll(RegExp(r'[^\w.\u4e00-\u9fff-]+'), '_');
  if (safe.isEmpty) safe = 'image.$ext';
  return _join([folder.isEmpty ? 'jingjian' : folder, month, '${d.millisecondsSinceEpoch}-$safe']);
}

typedef HttpSend = Future<http.StreamedResponse> Function(http.BaseRequest);

class ImageUploadService {
  ImageUploadService({HttpSend? send}) : _send = send ?? ((r) => r.send());
  static final ImageUploadService instance = ImageUploadService();
  final HttpSend _send;
  static const _timeout = Duration(seconds: 60);

  Future<http.Response> _go(http.BaseRequest r) async =>
      http.Response.fromStream(await _send(r).timeout(_timeout));

  Future<String> _form(String url, Uint8List bytes, String filename, String field, Map<String, String> headers,
      String path) async {
    final req = http.MultipartRequest('POST', Uri.parse(url))
      ..headers.addAll(headers)
      ..files.add(http.MultipartFile.fromBytes(field, bytes, filename: filename));
    final res = await _go(req);
    if (res.statusCode < 200 || res.statusCode >= 300) throw Exception('图床返回 ${res.statusCode}');
    final body = utf8.decode(res.bodyBytes, allowMalformed: true).trim();
    final ct = res.headers['content-type'] ?? '';
    if (ct.contains('json') || body.startsWith('{') || body.startsWith('[')) {
      final data = jsonDecode(body);
      if (data is Map && data['success'] == false && data['code'] == 'image_repeated' && data['images'] is String) {
        return data['images'] as String; // SM.MS duplicate upload
      }
      return pickImageUrl(data, path);
    }
    if (RegExp(r'^https?://', caseSensitive: false).hasMatch(body)) return body;
    throw Exception('图床返回无法解析');
  }

  Future<String> upload(ImageConfig c, Uint8List bytes, String filename) async {
    switch (c.uploader) {
      case ImageUploader.none:
        throw Exception('还没有选择上传服务');
      case ImageUploader.github:
        if (c.githubToken.trim().isEmpty || c.githubRepo.trim().isEmpty) throw Exception('请填写 GitHub Token 和仓库');
        final r = _repoParts(c.githubRepo);
        final remote = datedImageName(filename, c.githubPath);
        final branch = c.githubBranch.trim().isEmpty ? 'main' : c.githubBranch.trim();
        final req = http.Request('PUT', Uri.parse('https://api.github.com/repos/${r.owner}/${r.name}/contents/$remote'))
          ..headers.addAll({
            'Authorization': 'Bearer ${c.githubToken.trim()}',
            'Accept': 'application/vnd.github+json',
            'Content-Type': 'application/json',
          })
          ..body = jsonEncode({'message': 'jingjian: $filename', 'content': base64Encode(bytes), 'branch': branch});
        final res = await _go(req);
        if (res.statusCode < 200 || res.statusCode >= 300) throw Exception('GitHub 上传失败（${res.statusCode}）');
        if (c.githubLink == 'custom' && c.githubDomain.trim().isNotEmpty) {
          return '${c.githubDomain.trim().replaceAll(RegExp(r'/+$'), '')}/$remote';
        }
        if (c.githubLink == 'raw') return 'https://raw.githubusercontent.com/${r.owner}/${r.name}/$branch/$remote';
        return 'https://cdn.jsdelivr.net/gh/${r.owner}/${r.name}@$branch/$remote';
      case ImageUploader.gitee:
        if (c.giteeToken.trim().isEmpty || c.giteeRepo.trim().isEmpty) throw Exception('请填写 Gitee Token 和仓库');
        final r = _repoParts(c.giteeRepo);
        final remote = datedImageName(filename, c.giteePath);
        final branch = c.giteeBranch.trim().isEmpty ? 'master' : c.giteeBranch.trim();
        final req = http.Request('POST', Uri.parse('https://gitee.com/api/v5/repos/${r.owner}/${r.name}/contents/${Uri.encodeFull(remote)}'))
          ..bodyFields = {
            'access_token': c.giteeToken.trim(),
            'content': base64Encode(bytes),
            'message': 'jingjian: $filename',
            'branch': branch,
          };
        final res = await _go(req);
        if (res.statusCode < 200 || res.statusCode >= 300) throw Exception('Gitee 上传失败（${res.statusCode}）');
        return 'https://gitee.com/${r.owner}/${r.name}/raw/$branch/$remote';
      case ImageUploader.smms:
        if (c.smmsToken.trim().isEmpty) throw Exception('请填写 SM.MS Token');
        return _form('https://sm.ms/api/v2/upload', bytes, filename, 'smfile', {'Authorization': c.smmsToken.trim()}, 'data.url');
      case ImageUploader.lsky:
        if (c.lskyUrl.trim().isEmpty || c.lskyToken.trim().isEmpty) throw Exception('请填写兰空图床地址和 Token');
        final base = c.lskyUrl.trim().replaceAll(RegExp(r'/+$'), '');
        return _form('$base/api/v1/upload', bytes, filename, 'file',
            {'Authorization': 'Bearer ${c.lskyToken.trim()}', 'Accept': 'application/json'}, 'data.links.url');
      case ImageUploader.imgur:
        if (c.imgurClientId.trim().isEmpty) throw Exception('请填写 Imgur Client ID');
        return _form('https://api.imgur.com/3/image', bytes, filename, 'image',
            {'Authorization': 'Client-ID ${c.imgurClientId.trim()}'}, 'data.link');
      case ImageUploader.picgo:
        final url = c.picgoUrl.trim().isEmpty ? 'http://127.0.0.1:36677/upload' : c.picgoUrl.trim();
        final req = http.MultipartRequest('POST', Uri.parse(url))
          ..files.add(http.MultipartFile.fromBytes('list', bytes, filename: filename));
        final res = await _go(req);
        if (res.statusCode < 200 || res.statusCode >= 300) throw Exception('PicGo 返回 ${res.statusCode}');
        final data = jsonDecode(utf8.decode(res.bodyBytes));
        if (data is Map && data['success'] == false) throw Exception('PicGo 上传失败');
        return pickImageUrl(data, 'result.0');
      case ImageUploader.custom:
        if (c.customUrl.trim().isEmpty) throw Exception('请填写自定义上传地址');
        final t = c.customToken.trim();
        return _form(c.customUrl.trim(), bytes, filename, c.customFileField.trim().isEmpty ? 'file' : c.customFileField.trim(),
            t.isEmpty ? {} : {'Authorization': t.startsWith('Bearer ') ? t : 'Bearer $t'},
            c.customUrlPath.trim().isEmpty ? 'data.url' : c.customUrlPath.trim());
    }
  }

  Future<String> test(ImageConfig c) async {
    Future<int> get(String url, [Map<String, String>? h]) async {
      final req = http.Request('GET', Uri.parse(url));
      if (h != null) req.headers.addAll(h);
      return (await _go(req)).statusCode;
    }

    switch (c.uploader) {
      case ImageUploader.none:
        return '当前不上传，图片保存在本机';
      case ImageUploader.github:
        final r = _repoParts(c.githubRepo);
        final s = await get('https://api.github.com/user', {'Authorization': 'Bearer ${c.githubToken.trim()}'});
        if (s != 200) throw Exception('GitHub 验证失败（$s）');
        return 'GitHub 已连接，将写入 ${r.owner}/${r.name}';
      case ImageUploader.gitee:
        final r = _repoParts(c.giteeRepo);
        if (c.giteeToken.trim().isEmpty) throw Exception('请填写 Gitee Token');
        final s = await get('https://gitee.com/api/v5/user?access_token=${Uri.encodeQueryComponent(c.giteeToken.trim())}');
        if (s != 200) throw Exception('Gitee 验证失败（$s）');
        return 'Gitee 已连接，将写入 ${r.owner}/${r.name}';
      case ImageUploader.smms:
        final s = await get('https://sm.ms/api/v2/profile', {'Authorization': c.smmsToken.trim()});
        if (s < 200 || s >= 300) throw Exception('SM.MS 验证失败（$s）');
        return 'SM.MS 已连接';
      case ImageUploader.lsky:
        final base = c.lskyUrl.trim().replaceAll(RegExp(r'/+$'), '');
        final s = await get('$base/api/v1/profile', {'Authorization': 'Bearer ${c.lskyToken.trim()}', 'Accept': 'application/json'});
        if (s < 200 || s >= 300) throw Exception('兰空图床验证失败（$s）');
        return '兰空图床已连接';
      case ImageUploader.imgur:
        if (c.imgurClientId.trim().isEmpty) throw Exception('请填写 Imgur Client ID');
        final id = c.imgurClientId.trim();
        return 'Imgur Client ID 已填写（${id.length > 6 ? id.substring(0, 6) : id}…）';
      case ImageUploader.picgo:
        final url = c.picgoUrl.trim().isEmpty ? 'http://127.0.0.1:36677/upload' : c.picgoUrl.trim();
        try {
          final s = await get(url.replaceFirst(RegExp(r'/upload/?$'), '/'));
          if (s >= 500) throw Exception();
        } catch (_) {
          throw Exception('无法连接 PicGo（请确认 PicGo 已开启 Server，且本机/局域网可访问）');
        }
        return 'PicGo 接口 $url';
      case ImageUploader.custom:
        if (c.customUrl.trim().isEmpty) throw Exception('请填写自定义上传地址');
        return '自定义接口 ${c.customUrl.trim()}';
    }
  }
}

/// Decide local-vs-upload for a freshly inserted / pasted image and return the
/// markdown src (old `resolveInsertedImage`). [fromLibrary] = image already in
/// the local library (never deleted).
Future<({String src, bool uploaded})> resolveInsertedImage(
  Uint8List bytes,
  String name, {
  ImageConfig? config,
  StoredImage? existing,
  ImageUploadService? uploader,
}) async {
  final c = config ?? await readImageConfig();
  if (c.uploads && c.applyToLocal) {
    final url = await (uploader ?? ImageUploadService.instance).upload(c, bytes, name);
    if (existing == null && c.keepLocalCopy) await ImageStore.instance.saveBytes(bytes, name);
    return (src: url, uploaded: true);
  }
  final stored = existing ?? await ImageStore.instance.saveBytes(bytes, name);
  return (src: formatImageSrc(stored.path, c), uploaded: false);
}
