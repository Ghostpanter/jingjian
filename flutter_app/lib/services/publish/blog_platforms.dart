import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

import '../../models/note.dart';
import '../blog_service.dart';
import '../export_service.dart';
import '../html_markdown.dart';
import '../image_store.dart';
import '../image_upload.dart';
import '../note_file.dart';

/// Port of old app blog-platforms.ts + blog-platform-publish.ts.
/// Same storage keys / JSON shape (`jingjian.blog.platforms.v1`,
/// `jingjian.blog.targets.v1`) so republishing updates the same remote post.
enum PlatformId { git, wordpress, typecho, halo, ghost, yuque }

const platformInfo = {
  PlatformId.git: ('静态博客', 'Hugo / Hexo，GitHub 或 Gitee'),
  PlatformId.wordpress: ('WordPress', '用应用密码，不是登录密码'),
  PlatformId.typecho: ('Typecho', '站点用户名和密码'),
  PlatformId.halo: ('Halo', '个人令牌'),
  PlatformId.ghost: ('Ghost', 'Admin API 密钥，写成 id:secret'),
  PlatformId.yuque: ('语雀', '知识库写成 用户名/知识库'),
};

String platformLabel(PlatformId id) => platformInfo[id]!.$1;

/// One site config; fields unused by a platform stay empty.
class SiteConfig {
  SiteConfig(this.id);
  final PlatformId id;
  bool enabled = false;
  String site = '', username = '', password = '', token = '', adminKey = '', repo = '';
  String category = '', tags = '', cover = '';

  /// wordpress: publish|draft · ghost: published|draft · typecho/halo: publish flag · yuque: public flag
  bool publish = true;

  Map<String, dynamic> toJson() {
    final base = <String, dynamic>{'enabled': enabled, 'category': category, 'tags': tags, 'cover': cover};
    switch (id) {
      case PlatformId.wordpress:
        return {...base, 'site': site, 'username': username, 'password': password, 'status': publish ? 'publish' : 'draft'};
      case PlatformId.typecho:
        return {...base, 'site': site, 'username': username, 'password': password, 'publish': publish};
      case PlatformId.halo:
        return {...base, 'site': site, 'token': token, 'publish': publish};
      case PlatformId.ghost:
        return {...base, 'site': site, 'adminKey': adminKey, 'status': publish ? 'published' : 'draft'};
      case PlatformId.yuque:
        return {...base, 'token': token, 'repo': repo, 'public': publish};
      case PlatformId.git:
        return base;
    }
  }

  static SiteConfig fromJson(PlatformId id, Map<String, dynamic>? j) {
    final c = SiteConfig(id);
    if (j == null) return c;
    String s(String k) => j[k] is String ? j[k] as String : '';
    c.enabled = j['enabled'] == true;
    c.site = s('site');
    c.username = s('username');
    c.password = s('password');
    c.token = s('token');
    c.adminKey = s('adminKey');
    c.repo = s('repo');
    c.category = s('category');
    c.tags = s('tags');
    c.cover = s('cover');
    c.publish = switch (id) {
      PlatformId.wordpress => j['status'] != 'draft',
      PlatformId.ghost => j['status'] != 'draft',
      PlatformId.yuque => j['public'] != false,
      _ => j['publish'] != false,
    };
    return c;
  }

  bool get ready => switch (id) {
        PlatformId.wordpress || PlatformId.typecho =>
          site.trim().isNotEmpty && username.trim().isNotEmpty && password.trim().isNotEmpty,
        PlatformId.halo => site.trim().isNotEmpty && token.trim().isNotEmpty,
        PlatformId.ghost => site.trim().isNotEmpty && adminKey.contains(':'),
        PlatformId.yuque => token.trim().isNotEmpty && repo.contains('/'),
        PlatformId.git => false,
      };
}

class PlatformPrefs {
  PlatformId selected = PlatformId.git;
  bool defaultsSet = false;
  List<PlatformId> defaults = [];
  bool? gitEnabled;
  final sites = {for (final id in PlatformId.values.skip(1)) id: SiteConfig(id)};

  Map<String, dynamic> toJson() => {
        'selected': selected.name,
        'defaultsSet': defaultsSet,
        'defaults': defaults.map((e) => e.name).toList(),
        'gitEnabled': gitEnabled,
        for (final e in sites.entries) e.key.name: e.value.toJson(),
      };

  static PlatformPrefs fromJson(Map<String, dynamic> j) {
    PlatformId? pid(Object? v) => PlatformId.values.where((e) => e.name == v).firstOrNull;
    final p = PlatformPrefs();
    p.selected = pid(j['selected']) ?? PlatformId.git;
    p.defaultsSet = j['defaultsSet'] == true;
    p.defaults = (j['defaults'] is List ? j['defaults'] as List : const []).map(pid).whereType<PlatformId>().toList();
    p.gitEnabled = j['gitEnabled'] is bool ? j['gitEnabled'] as bool : null;
    for (final id in p.sites.keys.toList()) {
      final raw = j[id.name];
      p.sites[id] = SiteConfig.fromJson(id, raw is Map ? raw.cast<String, dynamic>() : null);
    }
    return p;
  }

  bool enabled(PlatformId id, bool gitConfigured) => id == PlatformId.git ? (gitEnabled ?? gitConfigured) : sites[id]!.enabled;
}

const _prefsKey = 'jingjian.blog.platforms.v1';
const _targetsKey = 'jingjian.blog.targets.v1';

Future<PlatformPrefs> readPlatformPrefs() async {
  final p = await SharedPreferences.getInstance();
  try {
    final raw = p.getString(_prefsKey);
    return raw == null ? PlatformPrefs() : PlatformPrefs.fromJson(jsonDecode(raw) as Map<String, dynamic>);
  } catch (_) {
    return PlatformPrefs();
  }
}

Future<void> writePlatformPrefs(PlatformPrefs prefs) async {
  final p = await SharedPreferences.getInstance();
  await p.setString(_prefsKey, jsonEncode(prefs.toJson()));
}

class TargetRecord {
  TargetRecord(this.remoteId, this.url, this.at);
  final String remoteId;
  final String url;
  final int at;
}

Future<Map<String, dynamic>> _targets() async {
  final p = await SharedPreferences.getInstance();
  try {
    return (jsonDecode(p.getString(_targetsKey) ?? '{}') as Map).cast<String, dynamic>();
  } catch (_) {
    return {};
  }
}

Future<TargetRecord?> targetFor(String noteId, PlatformId id) async {
  final t = (await _targets())[noteId];
  if (t is! Map) return null;
  final r = t[id.name];
  if (r is! Map || r['remoteId'] is! String || (r['remoteId'] as String).isEmpty) return null;
  return TargetRecord(r['remoteId'] as String, r['url'] as String? ?? '', (r['at'] as num?)?.toInt() ?? 0);
}

Future<void> rememberTarget(String noteId, PlatformId id, String remoteId, String url) async {
  final all = await _targets();
  final row = (all[noteId] is Map ? (all[noteId] as Map).cast<String, dynamic>() : <String, dynamic>{});
  row[id.name] = {'remoteId': remoteId, 'url': url, 'at': DateTime.now().millisecondsSinceEpoch};
  all[noteId] = row;
  final p = await SharedPreferences.getInstance();
  await p.setString(_targetsKey, jsonEncode(all));
}

// ---------------- helpers (ported 1:1) ----------------

String siteBase(String input) {
  var raw = input.trim();
  if (raw.isEmpty) throw Exception('请填写站点地址');
  if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(raw)) raw = 'https://$raw';
  final u = Uri.tryParse(raw);
  if (u == null || u.host.isEmpty) throw Exception('站点地址不对');
  var path = u.path.replaceAll(RegExp(r'/+$'), '');
  for (final re in [
    r'/wp-admin$',
    r'/wp-login\.php$',
    r'/xmlrpc\.php$',
    r'/index\.php/action/xmlrpc$',
    r'/action/xmlrpc$',
    r'/index\.php$',
  ]) {
    path = path.replaceFirst(RegExp(re, caseSensitive: false), '');
  }
  return '${u.scheme}://${u.host}${u.hasPort ? ':${u.port}' : ''}$path';
}

({String login, String book}) yuqueParts(String repo) {
  final cleaned = repo
      .trim()
      .replaceFirst(RegExp(r'^https?://(?:www\.)?yuque\.com/', caseSensitive: false), '')
      .replaceFirst(RegExp(r'\.git$', caseSensitive: false), '')
      .replaceAll(RegExp(r'^/+|/+$'), '');
  final parts = cleaned.split('/').map((s) => s.trim()).where((s) => s.isNotEmpty).toList();
  if (parts.length < 2) throw Exception('知识库写成 用户名/知识库');
  return (login: parts[0], book: parts[1]);
}

List<String> metaList(String? v) =>
    v == null ? [] : v.split(RegExp(r'[,，]')).map((s) => s.trim()).where((s) => s.isNotEmpty).toList();

String stripFrontMatterBlock(String content) {
  final text = content.replaceFirst('\uFEFF', '');
  final m = RegExp(r'^---\r?\n[\s\S]*?\r?\n---\r?\n?').firstMatch(text);
  if (m == null) return text;
  return text.substring(m.end).replaceFirst(RegExp(r'^\r?\n'), '');
}

String xmlEscape(String v) => v
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

String decodeXml(String v) => v
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAllMapped(RegExp(r'&#(\d+);'), (m) => String.fromCharCode(int.parse(m[1]!)))
    .replaceAll('&amp;', '&');

String xmlString(String v) => '<string>${xmlEscape(v)}</string>';

String xmlRpcCall(String method, List<String> params) =>
    '<?xml version="1.0" encoding="UTF-8"?><methodCall><methodName>$method</methodName><params>'
    '${params.map((p) => '<param><value>$p</value></param>').join()}</params></methodCall>';

String xmlArray(List<String> values) =>
    '<array><data>${values.map((v) => '<value>${xmlString(v)}</value>').join()}</data></array>';

String? xmlRpcFault(String xml) {
  if (!xml.contains('<fault>')) return null;
  final m = RegExp(r'<name>faultString</name>\s*<value>(?:<string>)?([\s\S]*?)(?:</string>)?</value>').firstMatch(xml);
  final s = m?[1]?.trim() ?? '';
  return decodeXml(s.isEmpty ? '站点拒绝了这次发布' : s);
}

List<Map<String, String>> xmlRpcStructs(String xml) {
  final out = <Map<String, String>>[];
  for (final m in RegExp(r'<struct>([\s\S]*?)</struct>').allMatches(xml)) {
    final rec = <String, String>{};
    for (final mem in RegExp(r'<name>([\s\S]*?)</name>\s*<value>([\s\S]*?)</value>').allMatches(m[1]!)) {
      final inner = mem[2]!.replaceAll(RegExp(r'</?(?:string|int|i4|boolean|double|dateTime\.iso8601|base64)>'), '');
      rec[decodeXml(mem[1]!.trim())] = decodeXml(inner.trim());
    }
    if (rec.isNotEmpty) out.add(rec);
  }
  return out;
}

String? xmlRpcString(String xml) {
  final m = RegExp(r'<string>([\s\S]*?)</string>').firstMatch(xml);
  return m == null ? null : decodeXml(m[1]!.trim());
}

String _b64url(List<int> b) => base64Url.encode(b).replaceAll('=', '');

List<int> _hex(String s) {
  final clean = s.trim();
  if (clean.length.isOdd || !RegExp(r'^[0-9a-fA-F]+$').hasMatch(clean)) throw Exception('Ghost 密钥写成 id:secret');
  return [for (var i = 0; i < clean.length; i += 2) int.parse(clean.substring(i, i + 2), radix: 16)];
}

String ghostAdminToken(String adminKey, {DateTime? now}) {
  final at = adminKey.indexOf(':');
  final id = at < 0 ? '' : adminKey.substring(0, at).trim();
  final secret = at < 0 ? '' : adminKey.substring(at + 1).trim();
  if (id.isEmpty || secret.isEmpty) throw Exception('Ghost 密钥写成 id:secret');
  final header = _b64url(utf8.encode(jsonEncode({'alg': 'HS256', 'kid': id, 'typ': 'JWT'})));
  final iat = (now ?? DateTime.now()).millisecondsSinceEpoch ~/ 1000;
  final payload = _b64url(utf8.encode(jsonEncode({'iat': iat, 'exp': iat + 300, 'aud': '/admin/'})));
  final data = '$header.$payload';
  final sig = Hmac(sha256, _hex(secret)).convert(utf8.encode(data)).bytes;
  return '$data.${_b64url(sig)}';
}

String basicAuth(String user, String pass) =>
    'Basic ${base64Encode(utf8.encode('${user.trim()}:${pass.replaceAll(RegExp(r'\s+'), '')}'))}';

class PublishResult {
  PublishResult(this.id, this.detail, this.updated);
  final PlatformId id;
  final String detail;
  final bool updated;
  String get label => platformLabel(id);
}

class Article {
  Article(this.title, this.markdown, this.html);
  final String title;
  final String markdown;
  final String html;
}

typedef HttpSend = Future<http.StreamedResponse> Function(http.BaseRequest);

class BlogPlatformService {
  BlogPlatformService({HttpSend? send}) : _send = send ?? ((r) => r.send());
  static final BlogPlatformService instance = BlogPlatformService();
  final HttpSend _send;

  Future<http.Response> _fetch(String url,
      {String method = 'GET', Map<String, String>? headers, Object? body}) async {
    final req = http.Request(method, Uri.parse(url));
    if (headers != null) req.headers.addAll(headers);
    if (body is String) {
      req.bodyBytes = utf8.encode(body);
    } else if (body is List<int>) {
      req.bodyBytes = body;
    }
    try {
      return await http.Response.fromStream(await _send(req).timeout(const Duration(seconds: 25)));
    } on Exception catch (e) {
      if (e.toString().contains('Timeout')) throw Exception('连接超时');
      throw Exception('连不上这个站点');
    }
  }

  String _text(http.Response r) => utf8.decode(r.bodyBytes, allowMalformed: true);

  dynamic _json(http.Response r) {
    try {
      return jsonDecode(_text(r));
    } catch (_) {
      return null;
    }
  }

  String _errorText(http.Response r) {
    final t = _text(r);
    final d = _json(r);
    if (d is Map) {
      for (final k in ['message', 'detail', 'error']) {
        final v = d[k];
        if (v is String && v.trim().isNotEmpty) return v.trim();
      }
    }
    final s = t.trim();
    return s.length > 160 ? s.substring(0, 160) : s;
  }

  Exception _httpError(String name, http.Response r) {
    if (r.statusCode == 401 || r.statusCode == 403) return Exception('$name：账号或密钥不对');
    if (r.statusCode == 404) return Exception('$name：地址不对，或接口没打开');
    final m = _errorText(r);
    return Exception(m.isNotEmpty ? '$name：$m' : '$name 失败（${r.statusCode}）');
  }

  bool _ok(http.Response r) => r.statusCode >= 200 && r.statusCode < 300;

  /// Upload local `images/<id>` to the configured 图床 (if any) so remote
  /// platforms can display them; otherwise HTML gets data URIs.
  Future<String> _withHostedImages(String content) async {
    final cfg = await readImageConfig();
    if (!cfg.uploads) return content;
    var out = content;
    for (final id in imageIdsIn(content)) {
      final f = ImageStore.instance.fileForIdSync(id);
      if (f == null) continue;
      final Uint8List bytes = await f.readAsBytes();
      final url = await ImageUploadService.instance.upload(cfg, bytes, f.uri.pathSegments.last);
      out = out.replaceAll(RegExp('(?:\\./)?(?:images/|jingjian-img://)$id(?:\\.[a-z0-9]+)?', caseSensitive: false), url);
    }
    return out;
  }

  Future<Article> article(String content) async {
    if (content.trim().isEmpty) throw Exception('这篇还没有内容');
    final hosted = await _withHostedImages(content);
    final source = stripFrontMatterBlock(hosted);
    final title = firstLineTitle(source);
    final markdown = BlogService.instance.stripMatchingHeading(source, title).trimLeft();
    final html = await ExportService.instance.bodyHtml(markdown.isEmpty ? source : markdown);
    return Article(title, markdown, html);
  }

  String _coverMd(String md, String cover) {
    final u = cover.trim();
    return u.isEmpty || md.contains(u) ? md : '![]($u)\n\n$md';
  }

  String _coverHtml(String html, String cover) {
    final u = cover.trim();
    return u.isEmpty || html.contains(u) ? html : '<p><img src="${escapeHtml(u)}" alt="" /></p>\n$html';
  }

  String slug(String t) => BlogService.instance.postSlug(t);

  // ---------- WordPress ----------
  Map<String, String> _wpHeaders(SiteConfig s, {bool json = false}) => {
        'Authorization': basicAuth(s.username, s.password),
        'Accept': 'application/json',
        if (json) 'Content-Type': 'application/json',
      };

  Future<int> _wpTerm(String base, SiteConfig s, String kind, String name) async {
    final search = await _fetch('$base/wp-json/wp/v2/$kind?search=${Uri.encodeQueryComponent(name)}&per_page=20',
        headers: _wpHeaders(s, json: true));
    if (_ok(search)) {
      final list = _json(search);
      if (list is List) {
        for (final it in list) {
          if (it is Map && (it['name'] as String?)?.toLowerCase() == name.toLowerCase() && it['id'] is num) {
            return (it['id'] as num).toInt();
          }
        }
      }
    }
    final created = await _fetch('$base/wp-json/wp/v2/$kind',
        method: 'POST', headers: _wpHeaders(s, json: true), body: jsonEncode({'name': name}));
    if (!_ok(created)) throw _httpError('WordPress', created);
    final d = _json(created);
    if (d is! Map || d['id'] is! num) throw Exception('WordPress：没有建成${kind == 'tags' ? '标签' : '分类'}');
    return (d['id'] as num).toInt();
  }

  Future<int?> _wpCover(String base, SiteConfig s, String cover) async {
    final url = cover.trim();
    if (!RegExp(r'^https?://', caseSensitive: false).hasMatch(url)) return null;
    try {
      final img = await _fetch(url);
      if (!_ok(img) || img.bodyBytes.isEmpty || img.bodyBytes.length > 12000000) return null;
      final ct = img.headers['content-type'] ?? '';
      final mime = ct.startsWith('image/')
          ? ct.split(';').first
          : RegExp(r'\.png($|\?)', caseSensitive: false).hasMatch(url)
              ? 'image/png'
              : RegExp(r'\.webp($|\?)', caseSensitive: false).hasMatch(url)
                  ? 'image/webp'
                  : RegExp(r'\.gif($|\?)', caseSensitive: false).hasMatch(url)
                      ? 'image/gif'
                      : 'image/jpeg';
      var name = Uri.decodeComponent(Uri.parse(url).pathSegments.lastOrNull ?? '').replaceAll(RegExp(r'[^\w.-]+'), '_');
      if (!RegExp(r'\.(jpe?g|png|gif|webp)$', caseSensitive: false).hasMatch(name)) {
        name = 'cover.${mime.contains('png') ? 'png' : mime.contains('webp') ? 'webp' : mime.contains('gif') ? 'gif' : 'jpg'}';
      }
      final up = await _fetch('$base/wp-json/wp/v2/media', method: 'POST', headers: {
        'Authorization': basicAuth(s.username, s.password),
        'Content-Type': mime,
        'Content-Disposition': 'attachment; filename="${name.replaceAll('"', '')}"',
        'Accept': 'application/json',
      }, body: img.bodyBytes);
      if (!_ok(up)) return null;
      final d = _json(up);
      return d is Map && d['id'] is num && (d['id'] as num) > 0 ? (d['id'] as num).toInt() : null;
    } catch (_) {
      return null;
    }
  }

  Future<String> testWordPress(SiteConfig s) async {
    final base = siteBase(s.site);
    final r = await _fetch('$base/wp-json/wp/v2/users/me', headers: _wpHeaders(s));
    if (!_ok(r)) throw _httpError('WordPress', r);
    return '已连接 WordPress $base';
  }

  Future<PublishResult> publishWordPress(String noteId, String content, SiteConfig s) async {
    final a = await article(content);
    final base = siteBase(s.site);
    final prev = await targetFor(noteId, PlatformId.wordpress);
    final cats = [for (final n in metaList(s.category)) await _wpTerm(base, s, 'categories', n)];
    final tags = [for (final n in metaList(s.tags)) await _wpTerm(base, s, 'tags', n)];
    final featured = s.cover.trim().isEmpty ? null : await _wpCover(base, s, s.cover);
    final body = <String, dynamic>{
      'title': a.title,
      'content': featured != null ? a.html : _coverHtml(a.html, s.cover),
      'status': s.publish ? 'publish' : 'draft',
      'slug': slug(a.title),
      if (featured != null) 'featured_media': featured,
      if (cats.isNotEmpty) 'categories': cats,
      if (tags.isNotEmpty) 'tags': tags,
    };
    final path = prev != null
        ? '$base/wp-json/wp/v2/posts/${Uri.encodeComponent(prev.remoteId)}'
        : '$base/wp-json/wp/v2/posts';
    final r = await _fetch(path, method: 'POST', headers: _wpHeaders(s, json: true), body: jsonEncode(body));
    if (!_ok(r)) throw _httpError('WordPress', r);
    final d = _json(r);
    final remoteId = d is Map && d['id'] != null ? '${d['id']}' : prev?.remoteId ?? '';
    final url = d is Map && d['link'] is String ? d['link'] as String : prev?.url ?? base;
    if (remoteId.isNotEmpty) await rememberTarget(noteId, PlatformId.wordpress, remoteId, url);
    return PublishResult(PlatformId.wordpress, url, prev != null);
  }

  // ---------- Typecho (XML-RPC metaWeblog) ----------
  Future<String> _typechoCall(SiteConfig s, String body) async {
    final base = siteBase(s.site);
    final urls = RegExp('xmlrpc', caseSensitive: false).hasMatch(s.site)
        ? [s.site.trim()]
        : ['$base/index.php/action/xmlrpc', '$base/action/xmlrpc'];
    var last = '连不上 Typecho';
    for (final url in urls) {
      final r = await _fetch(url, method: 'POST', headers: {'Content-Type': 'text/xml; charset=utf-8'}, body: body);
      if (r.statusCode == 404) {
        last = '找不到 Typecho 的 XML-RPC';
        continue;
      }
      final text = _text(r);
      if (!_ok(r)) {
        last = 'Typecho 失败（${r.statusCode}）';
        continue;
      }
      final f = xmlRpcFault(text);
      if (f != null) throw Exception('Typecho：$f');
      return text;
    }
    throw Exception(last);
  }

  Future<String> testTypecho(SiteConfig s) async {
    final xml = await _typechoCall(
        s, xmlRpcCall('blogger.getUsersBlogs', [xmlString(''), xmlString(s.username.trim()), xmlString(s.password)]));
    if (!xml.contains('<array>') && !xml.contains('<struct>')) throw Exception('Typecho 没有返回站点');
    return '已连接 Typecho ${siteBase(s.site)}';
  }

  Future<PublishResult> publishTypecho(String noteId, String content, SiteConfig s) async {
    final a = await article(content);
    final md = _coverMd(a.markdown.isEmpty ? a.title : a.markdown, s.cover);
    final members = [
      '<member><name>title</name><value>${xmlString(a.title)}</value></member>',
      '<member><name>description</name><value>${xmlString(md)}</value></member>',
      if (metaList(s.category).isNotEmpty)
        '<member><name>categories</name><value>${xmlArray(metaList(s.category))}</value></member>',
      if (metaList(s.tags).isNotEmpty)
        '<member><name>mt_keywords</name><value>${xmlString(metaList(s.tags).join(','))}</value></member>',
    ];
    final struct = '<struct>${members.join()}</struct>';
    final prev = await targetFor(noteId, PlatformId.typecho);
    final flag = '<boolean>${s.publish ? 1 : 0}</boolean>';
    final xml = await _typechoCall(
        s,
        xmlRpcCall(prev != null ? 'metaWeblog.editPost' : 'metaWeblog.newPost', [
          xmlString(prev?.remoteId ?? ''),
          xmlString(s.username.trim()),
          xmlString(s.password),
          struct,
          flag,
        ]));
    var remoteId = prev?.remoteId ?? '';
    if (prev == null) {
      remoteId = xmlRpcString(xml) ?? RegExp(r'<(?:int|i4)>(\d+)</(?:int|i4)>').firstMatch(xml)?[1] ?? '';
    }
    final url = prev?.url ?? siteBase(s.site);
    if (remoteId.isNotEmpty) await rememberTarget(noteId, PlatformId.typecho, remoteId, url);
    return PublishResult(PlatformId.typecho, remoteId.isNotEmpty ? '文章 $remoteId' : url, prev != null);
  }

  // ---------- Halo 2.x ----------
  Map<String, String> _halo(String token, {bool json = false}) => {
        'Authorization': 'Bearer ${token.trim()}',
        'Accept': 'application/json',
        if (json) 'Content-Type': 'application/json',
      };

  Future<String> testHalo(SiteConfig s) async {
    final base = siteBase(s.site);
    final r = await _fetch('$base/apis/api.console.halo.run/v1alpha1/posts?page=1&size=1', headers: _halo(s.token));
    if (!_ok(r)) throw _httpError('Halo', r);
    return '已连接 Halo $base';
  }

  Future<String> _haloEnsure(String base, String token, String kind, String displayName) async {
    final list = await _fetch('$base/apis/content.halo.run/v1alpha1/$kind?page=0&size=200', headers: _halo(token, json: true));
    if (!_ok(list)) throw _httpError('Halo', list);
    final d = _json(list);
    final items = d is Map && d['items'] is List ? d['items'] as List : const [];
    for (final it in items) {
      if (it is Map && it['spec'] is Map && (it['spec'] as Map)['displayName'] == displayName) {
        final name = (it['metadata'] as Map?)?['name'];
        if (name is String && name.isNotEmpty) return name;
      }
    }
    final created = await _fetch('$base/apis/content.halo.run/v1alpha1/$kind',
        method: 'POST',
        headers: _halo(token, json: true),
        body: jsonEncode({
          'apiVersion': 'content.halo.run/v1alpha1',
          'kind': kind == 'tags' ? 'Tag' : 'Category',
          'metadata': {'generateName': kind == 'tags' ? 'tag-' : 'category-'},
          'spec': {'displayName': displayName, 'slug': slug(displayName), 'cover': ''},
        }));
    if (!_ok(created)) throw _httpError('Halo', created);
    final p = _json(created);
    final meta = p is Map ? p['metadata'] : null;
    final name = meta is Map ? meta['name'] : null;
    if (name is! String || name.isEmpty) throw Exception(kind == 'tags' ? 'Halo：标签没有建成' : 'Halo：分类没有建成');
    return name;
  }

  Future<PublishResult> publishHalo(String noteId, String content, SiteConfig s) async {
    final a = await article(content);
    final base = siteBase(s.site);
    final prev = await targetFor(noteId, PlatformId.halo);
    final md = '# ${a.title}\n\n${a.markdown}'.trim();
    final tags = [for (final n in metaList(s.tags)) await _haloEnsure(base, s.token, 'tags', n)];
    final cats = [for (final n in metaList(s.category)) await _haloEnsure(base, s.token, 'categories', n)];
    final cover = s.cover.trim();
    final contentBody = {'raw': md, 'content': a.html, 'rawType': 'markdown'};
    if (prev != null) {
      final r = await _fetch('$base/apis/api.console.halo.run/v1alpha1/posts/${Uri.encodeComponent(prev.remoteId)}/content',
          method: 'PUT', headers: _halo(s.token, json: true), body: jsonEncode(contentBody));
      if (!_ok(r)) throw _httpError('Halo', r);
      final vis = await _fetch(
          '$base/apis/api.console.halo.run/v1alpha1/posts/${Uri.encodeComponent(prev.remoteId)}/${s.publish ? 'publish' : 'unpublish'}',
          method: 'PUT',
          headers: _halo(s.token));
      if (!_ok(vis) && vis.statusCode != 400 && vis.statusCode != 405) throw _httpError('Halo', vis);
      if (cover.isNotEmpty || tags.isNotEmpty || cats.isNotEmpty) {
        final url = '$base/apis/content.halo.run/v1alpha1/posts/${Uri.encodeComponent(prev.remoteId)}';
        final cur = await _fetch(url, headers: _halo(s.token, json: true));
        if (!_ok(cur)) throw _httpError('Halo', cur);
        final post = (_json(cur) as Map).cast<String, dynamic>();
        final spec = {...(post['spec'] as Map? ?? {})};
        if (cover.isNotEmpty) spec['cover'] = cover;
        if (tags.isNotEmpty) spec['tags'] = tags;
        if (cats.isNotEmpty) spec['categories'] = cats;
        post['spec'] = spec;
        final saved = await _fetch(url, method: 'PUT', headers: _halo(s.token, json: true), body: jsonEncode(post));
        if (!_ok(saved)) throw _httpError('Halo', saved);
      }
      return PublishResult(PlatformId.halo, prev.url, true);
    }
    final r = await _fetch('$base/apis/api.console.halo.run/v1alpha1/posts',
        method: 'POST',
        headers: _halo(s.token, json: true),
        body: jsonEncode({
          'post': {
            'apiVersion': 'content.halo.run/v1alpha1',
            'kind': 'Post',
            'metadata': {'name': '', 'generateName': 'post-'},
            'spec': {
              'title': a.title,
              'slug': slug(a.title),
              'template': '',
              'cover': cover,
              'deleted': false,
              'publish': s.publish,
              'pinned': false,
              'allowComment': true,
              'visible': 'PUBLIC',
              'priority': 0,
              'excerpt': {'autoGenerate': true, 'raw': ''},
              'categories': cats,
              'tags': tags,
              'htmlMetas': [],
            },
          },
          'content': contentBody,
        }));
    if (!_ok(r)) throw _httpError('Halo', r);
    final p = _json(r);
    String? pick(List<String> path) {
      Object? cur = p;
      for (final k in path) {
        cur = cur is Map ? cur[k] : null;
      }
      return cur is String && cur.isNotEmpty ? cur : null;
    }

    final remoteId = pick(['post', 'metadata', 'name']) ?? pick(['metadata', 'name']) ?? '';
    final url = pick(['post', 'status', 'permalink']) ?? pick(['status', 'permalink']) ?? base;
    if (remoteId.isNotEmpty) {
      await rememberTarget(noteId, PlatformId.halo, remoteId, url);
      if (s.publish) {
        // Halo 2.x needs an explicit publish call for new drafts.
        await _fetch('$base/apis/api.console.halo.run/v1alpha1/posts/${Uri.encodeComponent(remoteId)}/publish',
            method: 'PUT', headers: _halo(s.token));
      }
    }
    return PublishResult(PlatformId.halo, url, false);
  }

  // ---------- Ghost ----------
  Future<String> testGhost(SiteConfig s) async {
    final base = siteBase(s.site);
    final r = await _fetch('$base/ghost/api/admin/site/',
        headers: {'Authorization': 'Ghost ${ghostAdminToken(s.adminKey)}', 'Accept': 'application/json'});
    if (!_ok(r)) throw _httpError('Ghost', r);
    return '已连接 Ghost $base';
  }

  Future<PublishResult> publishGhost(String noteId, String content, SiteConfig s) async {
    final a = await article(content);
    final base = siteBase(s.site);
    final headers = {
      'Authorization': 'Ghost ${ghostAdminToken(s.adminKey)}',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    final prev = await targetFor(noteId, PlatformId.ghost);
    String? updatedAt;
    if (prev != null) {
      final cur = await _fetch('$base/ghost/api/admin/posts/${Uri.encodeComponent(prev.remoteId)}/', headers: headers);
      if (!_ok(cur)) throw _httpError('Ghost', cur);
      final d = _json(cur);
      final posts = d is Map && d['posts'] is List ? d['posts'] as List : const [];
      if (posts.isNotEmpty && posts.first is Map) updatedAt = (posts.first as Map)['updated_at'] as String?;
    }
    final names = [...metaList(s.tags)];
    final cat = s.category.trim();
    if (cat.isNotEmpty && !names.any((n) => n.toLowerCase() == cat.toLowerCase())) names.add(cat);
    final post = <String, dynamic>{
      'title': a.title,
      'html': a.html.isEmpty ? '<p>${escapeHtml(a.title)}</p>' : a.html,
      'status': s.publish ? 'published' : 'draft',
      if (names.isNotEmpty) 'tags': [for (final n in names) {'name': n}],
      if (s.cover.trim().isNotEmpty) 'feature_image': s.cover.trim(),
      'updated_at': ?updatedAt,
    };
    final path = prev != null
        ? '$base/ghost/api/admin/posts/${Uri.encodeComponent(prev.remoteId)}/?source=html'
        : '$base/ghost/api/admin/posts/?source=html';
    final r = await _fetch(path, method: prev != null ? 'PUT' : 'POST', headers: headers, body: jsonEncode({'posts': [post]}));
    if (!_ok(r)) throw _httpError('Ghost', r);
    final d = _json(r);
    final created = d is Map && d['posts'] is List && (d['posts'] as List).isNotEmpty ? (d['posts'] as List).first as Map : const {};
    final remoteId = created['id'] as String? ?? prev?.remoteId ?? '';
    final url = created['url'] as String? ?? prev?.url ?? base;
    if (remoteId.isNotEmpty) await rememberTarget(noteId, PlatformId.ghost, remoteId, url);
    return PublishResult(PlatformId.ghost, url, prev != null);
  }

  // ---------- 语雀 ----------
  Future<String> testYuque(SiteConfig s) async {
    final p = yuqueParts(s.repo);
    final r = await _fetch('https://www.yuque.com/api/v2/user',
        headers: {'X-Auth-Token': s.token.trim(), 'Accept': 'application/json'});
    if (!_ok(r)) throw _httpError('语雀', r);
    return '已连接语雀 ${p.login}/${p.book}';
  }

  Future<PublishResult> publishYuque(String noteId, String content, SiteConfig s) async {
    final a = await article(content);
    final p = yuqueParts(s.repo);
    final prev = await targetFor(noteId, PlatformId.yuque);
    final root = 'https://www.yuque.com/api/v2/repos/${Uri.encodeComponent(p.login)}/${Uri.encodeComponent(p.book)}/docs';
    final r = await _fetch(prev != null ? '$root/${Uri.encodeComponent(prev.remoteId)}' : root,
        method: prev != null ? 'PUT' : 'POST',
        headers: {'X-Auth-Token': s.token.trim(), 'Content-Type': 'application/json', 'Accept': 'application/json'},
        body: jsonEncode({
          'title': a.title,
          'slug': slug(a.title),
          'public': s.publish ? 1 : 0,
          'format': 'markdown',
          'body': _coverMd(a.markdown.isEmpty ? a.title : a.markdown, s.cover),
        }));
    if (!_ok(r)) throw _httpError('语雀', r);
    final d = _json(r);
    final data = d is Map && d['data'] is Map ? d['data'] as Map : const {};
    final remoteId = data['id'] != null ? '${data['id']}' : prev?.remoteId ?? '';
    final sl = data['slug'] as String? ?? slug(a.title);
    final url = 'https://www.yuque.com/${p.login}/${p.book}/$sl';
    if (remoteId.isNotEmpty) await rememberTarget(noteId, PlatformId.yuque, remoteId, url);
    return PublishResult(PlatformId.yuque, url, prev != null);
  }

  // ---------- dispatch ----------
  Future<String> test(PlatformId id, PlatformPrefs prefs) async {
    final s = prefs.sites[id];
    return switch (id) {
      PlatformId.git => BlogService.instance.test(),
      PlatformId.wordpress => testWordPress(s!),
      PlatformId.typecho => testTypecho(s!),
      PlatformId.halo => testHalo(s!),
      PlatformId.ghost => testGhost(s!),
      PlatformId.yuque => testYuque(s!),
    };
  }

  Future<({List<PublishResult> ok, List<(String, String)> failed})> publish(
      Note note, List<PlatformId> ids, PlatformPrefs prefs) async {
    final ok = <PublishResult>[];
    final failed = <(String, String)>[];
    for (final id in ids) {
      try {
        final s = prefs.sites[id];
        ok.add(switch (id) {
          PlatformId.git => PublishResult(PlatformId.git, await BlogService.instance.publish(note), false),
          PlatformId.wordpress => await publishWordPress(note.id, note.content, s!),
          PlatformId.typecho => await publishTypecho(note.id, note.content, s!),
          PlatformId.halo => await publishHalo(note.id, note.content, s!),
          PlatformId.ghost => await publishGhost(note.id, note.content, s!),
          PlatformId.yuque => await publishYuque(note.id, note.content, s!),
        });
      } catch (e) {
        failed.add((platformLabel(id), e.toString().replaceFirst('Exception: ', '')));
      }
    }
    return (ok: ok, failed: failed);
  }

  // ---------- pull back (old 博客文章 dialog) ----------
  Future<List<({String remoteId, String title, String url, String hint})>> listRemote(PlatformId id, PlatformPrefs prefs) async {
    final s = prefs.sites[id]!;
    switch (id) {
      case PlatformId.wordpress:
        final base = siteBase(s.site);
        final r = await _fetch(
            '$base/wp-json/wp/v2/posts?per_page=30&context=edit&status=publish,future,draft,pending,private&_fields=id,title,link,status',
            headers: _wpHeaders(s));
        if (!_ok(r)) throw _httpError('WordPress', r);
        final list = _json(r) as List? ?? const [];
        return [
          for (final p in list.whereType<Map>())
            if (p['id'] != null)
              (
                remoteId: '${p['id']}',
                title: _plain(((p['title'] as Map?)?['raw'] ?? (p['title'] as Map?)?['rendered'] ?? '未命名') as String),
                url: p['link'] as String? ?? base,
                hint: p['status'] == 'draft' ? '草稿' : 'WordPress',
              ),
        ];
      case PlatformId.typecho:
        final xml = await _typechoCall(
            s,
            xmlRpcCall('metaWeblog.getRecentPosts',
                [xmlString(''), xmlString(s.username.trim()), xmlString(s.password), '<int>30</int>']));
        return [
          for (final it in xmlRpcStructs(xml))
            if ((it['postid'] ?? it['postId'] ?? '').isNotEmpty)
              (
                remoteId: it['postid'] ?? it['postId']!,
                title: it['title'] ?? '未命名',
                url: it['link'] ?? it['permaLink'] ?? siteBase(s.site),
                hint: 'Typecho',
              ),
        ];
      case PlatformId.halo:
        final base = siteBase(s.site);
        final r = await _fetch('$base/apis/api.console.halo.run/v1alpha1/posts?page=1&size=30', headers: _halo(s.token));
        if (!_ok(r)) throw _httpError('Halo', r);
        final d = _json(r);
        final items = d is Map && d['items'] is List ? d['items'] as List : const [];
        final out = <({String remoteId, String title, String url, String hint})>[];
        for (final it in items.whereType<Map>()) {
          final post = (it['post'] ?? it) as Map;
          final name = (post['metadata'] as Map?)?['name'];
          if (name is! String || name.isEmpty) continue;
          final spec = post['spec'] as Map? ?? const {};
          out.add((
            remoteId: name,
            title: (spec['title'] as String?) ?? name,
            url: ((post['status'] as Map?)?['permalink'] as String?) ?? base,
            hint: spec['publish'] == false ? '草稿' : 'Halo',
          ));
        }
        return out;
      case PlatformId.ghost:
        final base = siteBase(s.site);
        final r = await _fetch('$base/ghost/api/admin/posts/?limit=30',
            headers: {'Authorization': 'Ghost ${ghostAdminToken(s.adminKey)}', 'Accept': 'application/json'});
        if (!_ok(r)) throw _httpError('Ghost', r);
        final d = _json(r);
        final posts = d is Map && d['posts'] is List ? d['posts'] as List : const [];
        return [
          for (final p in posts.whereType<Map>())
            if (p['id'] is String)
              (
                remoteId: p['id'] as String,
                title: p['title'] as String? ?? '未命名',
                url: p['url'] as String? ?? base,
                hint: p['status'] == 'draft' ? '草稿' : 'Ghost',
              ),
        ];
      case PlatformId.yuque:
        final p = yuqueParts(s.repo);
        final r = await _fetch(
            'https://www.yuque.com/api/v2/repos/${Uri.encodeComponent(p.login)}/${Uri.encodeComponent(p.book)}/docs',
            headers: {'X-Auth-Token': s.token.trim(), 'Accept': 'application/json'});
        if (!_ok(r)) throw _httpError('语雀', r);
        final d = _json(r);
        final list = d is Map && d['data'] is List ? d['data'] as List : const [];
        return [
          for (final doc in list.whereType<Map>())
            if (doc['id'] != null)
              (
                remoteId: '${doc['id']}',
                title: doc['title'] as String? ?? '未命名',
                url: 'https://www.yuque.com/${p.login}/${p.book}/${doc['slug'] ?? ''}',
                hint: '语雀',
              ),
        ];
      case PlatformId.git:
        return const [];
    }
  }

  String _plain(String v) =>
      v.replaceAll(RegExp(r'<[^>]+>'), '').replaceAll('&amp;', '&').replaceAll('&lt;', '<').replaceAll('&gt;', '>').trim();

  String _asMarkdown(String title, String body) {
    final t = body.replaceFirst('\uFEFF', '').trim();
    if (t.isEmpty) return '# $title\n\n';
    if (t.startsWith('#')) return t.endsWith('\n') ? t : '$t\n';
    return '# $title\n\n$t\n';
  }

  /// Returns markdown content of a remote post.
  Future<String> readRemote(PlatformId id, PlatformPrefs prefs, String remoteId) async {
    final s = prefs.sites[id]!;
    switch (id) {
      case PlatformId.wordpress:
        final base = siteBase(s.site);
        final r = await _fetch('$base/wp-json/wp/v2/posts/${Uri.encodeComponent(remoteId)}?context=edit', headers: _wpHeaders(s));
        if (!_ok(r)) throw _httpError('WordPress', r);
        final p = _json(r) as Map;
        final title = _plain(((p['title'] as Map?)?['raw'] ?? (p['title'] as Map?)?['rendered'] ?? '未命名') as String);
        final raw = ((p['content'] as Map?)?['raw'] as String?)?.trim() ?? '';
        return _asMarkdown(title, raw.isNotEmpty ? raw : htmlToMarkdown((p['content'] as Map?)?['rendered'] as String? ?? ''));
      case PlatformId.typecho:
        final xml = await _typechoCall(
            s, xmlRpcCall('metaWeblog.getPost', [xmlString(remoteId), xmlString(s.username.trim()), xmlString(s.password)]));
        final it = xmlRpcStructs(xml).firstOrNull;
        if (it == null) throw Exception('Typecho 没有这篇文章');
        return _asMarkdown(it['title'] ?? '未命名', it['description'] ?? '');
      case PlatformId.halo:
        final base = siteBase(s.site);
        final r = await _fetch('$base/apis/api.console.halo.run/v1alpha1/posts/${Uri.encodeComponent(remoteId)}/content',
            headers: _halo(s.token));
        if (!_ok(r)) throw _httpError('Halo', r);
        final d = _json(r) as Map? ?? const {};
        final body = (d['raw'] ?? d['content'] ?? '') as String;
        final t = firstLineTitle(body);
        return _asMarkdown(t == '未命名笔记' ? remoteId : t, body);
      case PlatformId.ghost:
        final base = siteBase(s.site);
        final r = await _fetch('$base/ghost/api/admin/posts/${Uri.encodeComponent(remoteId)}/?formats=html',
            headers: {'Authorization': 'Ghost ${ghostAdminToken(s.adminKey)}', 'Accept': 'application/json'});
        if (!_ok(r)) throw _httpError('Ghost', r);
        final d = _json(r);
        final posts = d is Map && d['posts'] is List ? d['posts'] as List : const [];
        if (posts.isEmpty) throw Exception('Ghost 没有这篇文章');
        final p = posts.first as Map;
        return _asMarkdown(p['title'] as String? ?? '未命名', htmlToMarkdown(p['html'] as String? ?? ''));
      case PlatformId.yuque:
        final p = yuqueParts(s.repo);
        final r = await _fetch(
            'https://www.yuque.com/api/v2/repos/${Uri.encodeComponent(p.login)}/${Uri.encodeComponent(p.book)}/docs/${Uri.encodeComponent(remoteId)}',
            headers: {'X-Auth-Token': s.token.trim(), 'Accept': 'application/json'});
        if (!_ok(r)) throw _httpError('语雀', r);
        final d = _json(r);
        final doc = d is Map && d['data'] is Map ? d['data'] as Map : null;
        if (doc == null) throw Exception('语雀没有这篇文章');
        return _asMarkdown(doc['title'] as String? ?? '未命名', doc['body'] as String? ?? '');
      case PlatformId.git:
        throw Exception('这个平台不能拉回');
    }
  }
}
