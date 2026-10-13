import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import '../models/blog_config.dart';
import '../models/note.dart';
import 'app_prefs.dart';
import 'note_file.dart';

class BlogService {
  BlogService._();
  static final BlogService instance = BlogService._();

  ({String owner, String name}) githubParts(String repo) {
    final cleaned = repo
        .trim()
        .replaceFirst(RegExp(r'^https?://(github|gitee)\.com/', caseSensitive: false), '')
        .replaceFirst(RegExp(r'\.git$', caseSensitive: false), '')
        .replaceAll(RegExp(r'/+$'), '');
    final parts = cleaned.split('/').where((p) => p.trim().isNotEmpty).toList();
    if (parts.length < 2) throw Exception('仓库写成 owner/repo');
    return (owner: parts[0], name: parts[1]);
  }

  String postSlug(String title) {
    final slug = title
        .toLowerCase()
        .replaceAll(RegExp(r'[^a-z0-9\u4e00-\u9fff]+'), '-')
        .replaceAll(RegExp(r'^-+|-+$'), '');
    final cut = slug.length > 48 ? slug.substring(0, 48) : slug;
    return cut.isEmpty ? 'post' : cut;
  }

  String _dateStamp([DateTime? now]) {
    final d = now ?? DateTime.now();
    String two(int n) => n.toString().padLeft(2, '0');
    return '${d.year}-${two(d.month)}-${two(d.day)}';
  }

  String _apiBase(BlogHost host) =>
      host == BlogHost.gitee ? 'https://gitee.com/api/v5' : 'https://api.github.com';

  String buildFrontMatter(Note note, BlogConfig config) {
    final title = firstLineTitle(note.content);
    final date = _dateStamp();
    final folderParts = note.folder?.split('/').where((p) => p.isNotEmpty).toList() ?? [];
    final category = folderParts.isEmpty ? null : folderParts.last;
    final extra = config.extraFrontMatter.trim();
    if (config.engine == BlogEngine.hugo) {
      final cat = category != null ? '\ncategories: ["$category"]' : '';
      return '---\ntitle: ${jsonEncode(title)}\ndate: ${date}T00:00:00+08:00$cat${extra.isEmpty ? '' : '\n$extra'}\n---\n';
    }
    final cats = category != null ? '\ncategories:\n  - $category' : '';
    return '---\ntitle: ${jsonEncode(title)}\ndate: $date 00:00:00$cats${extra.isEmpty ? '' : '\n$extra'}\n---\n';
  }

  String stripMatchingHeading(String content, String title) {
    final trimmed = content.replaceFirst(RegExp(r'^\uFEFF'), '');
    final first = trimmed.split('\n').first;
    final heading = first.replaceFirst(RegExp(r'^#{1,6}\s+'), '').trim();
    if (heading != title) return trimmed.trimLeft();
    return trimmed.substring(first.length).replaceFirst(RegExp(r'^\r?\n+'), '');
  }

  Future<String> publish(Note note, {BlogConfig? config}) async {
    final cfg = config ?? AppPrefs.instance.readBlogConfig();
    if (!cfg.isConfigured) throw Exception('请先在设置里填写博客仓库与 Token');
    final parts = githubParts(cfg.repo);
    final title = firstLineTitle(note.content);
    final remembered = AppPrefs.instance.readPublished()[note.id];
    final defaultPath =
        '${cfg.postsDir.replaceAll(RegExp(r'^/+|/+$'), '')}/${_dateStamp()}-${postSlug(title)}.md';
    final path = remembered ?? defaultPath;
    final body = buildFrontMatter(note, cfg) + stripMatchingHeading(note.content, title);
    final encodedPath = path.split('/').where((p) => p.isNotEmpty).map(Uri.encodeComponent).join('/');

    if (cfg.host == BlogHost.github) {
      final url =
          '${_apiBase(cfg.host)}/repos/${parts.owner}/${parts.name}/contents/$encodedPath';
      String? sha;
      final get = await _t(http.get(
        Uri.parse('$url?ref=${cfg.branch}'),
        headers: {
          'Authorization': 'Bearer ${cfg.token.trim()}',
          'Accept': 'application/vnd.github+json',
        },
      ));
      if (get.statusCode == 200) {
        sha = (jsonDecode(get.body) as Map)['sha'] as String?;
      }
      final payload = {
        'message': 'publish: $title',
        'content': base64Encode(utf8.encode(body)),
        'branch': cfg.branch,
        if (sha != null) 'sha': sha,
      };
      final put = await _t(http.put(
        Uri.parse(url),
        headers: {
          'Authorization': 'Bearer ${cfg.token.trim()}',
          'Accept': 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: jsonEncode(payload),
      ));
      if (put.statusCode < 200 || put.statusCode >= 300) {
        throw Exception('发布失败（${put.statusCode}）: ${put.body}');
      }
    } else {
      // Gitee
      final url =
          '${_apiBase(cfg.host)}/repos/${parts.owner}/${parts.name}/contents/$encodedPath';
      String? sha;
      final get = await _t(http.get(Uri.parse(
          '$url?access_token=${Uri.encodeQueryComponent(cfg.token.trim())}&ref=${Uri.encodeQueryComponent(cfg.branch)}')));
      if (get.statusCode == 200) {
        final d = jsonDecode(utf8.decode(get.bodyBytes));
        if (d is Map) sha = d['sha'] as String?;
      }
      final payload = {
        'access_token': cfg.token.trim(),
        'message': 'publish: $title',
        'content': base64Encode(utf8.encode(body)),
        'branch': cfg.branch,
        if (sha != null) 'sha': sha,
      };
      // Gitee: create = POST, update existing = PUT with sha.
      final put = await _t((sha == null ? http.post : http.put)(
        Uri.parse(url),
        headers: {'Content-Type': 'application/json'},
        body: jsonEncode(payload),
      ));
      if (put.statusCode < 200 || put.statusCode >= 300) {
        throw Exception('发布失败（${put.statusCode}）: ${put.body}');
      }
    }
    await AppPrefs.instance.rememberPublished(note.id, path);
    return path;
  }

  Future<String> test({BlogConfig? config}) async {
    final cfg = config ?? AppPrefs.instance.readBlogConfig();
    if (!cfg.isConfigured) throw Exception('请先填写博客仓库与 Token');
    final parts = githubParts(cfg.repo);
    final res = cfg.host == BlogHost.github
        ? await _t(http.get(Uri.parse('${_apiBase(cfg.host)}/repos/${parts.owner}/${parts.name}'),
            headers: {'Authorization': 'Bearer ${cfg.token.trim()}', 'Accept': 'application/vnd.github+json'}))
        : await _t(http.get(Uri.parse(
            '${_apiBase(cfg.host)}/repos/${parts.owner}/${parts.name}?access_token=${Uri.encodeQueryComponent(cfg.token.trim())}')));
    if (res.statusCode == 401 || res.statusCode == 403) throw Exception('Token 不对或没有权限');
    if (res.statusCode == 404) throw Exception('找不到仓库 ${parts.owner}/${parts.name}');
    if (res.statusCode != 200) throw Exception('连接失败（${res.statusCode}）');
    return '已连接 ${parts.owner}/${parts.name}';
  }

  static Future<http.Response> _t(Future<http.Response> f) async {
    try {
      return await f.timeout(const Duration(seconds: 30));
    } on TimeoutException {
      throw Exception('连接超时，请检查网络');
    } on http.ClientException catch (e) {
      throw Exception('网络连接失败（${e.message}）');
    }
  }
}
