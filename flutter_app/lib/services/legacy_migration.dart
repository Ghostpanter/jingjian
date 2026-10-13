import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:path/path.dart' as p;
import 'package:shared_preferences/shared_preferences.dart';

import '../models/note.dart';
import 'image_store.dart';
import 'note_store.dart';

/// 覆盖安装：把 1.7.x（Capacitor 版）留在 WebView 里的笔记、回收站、图片和设置
/// 搬进 Flutter 版。只读取旧数据，不删除；成功一次后不再重复。
class LegacyMigration {
  static const doneKey = 'jingjian.legacy.migrated.v1';
  static const _channel = MethodChannel('jingjian/legacy');

  /// Old settings whose JSON format is the same in both versions.
  static const copiedPrefs = [
    'jingjian.sync.v1',
    'jingjian.sync.tombstones.v1',
    'jingjian.blog.v1',
    'jingjian.blog.published.v1',
    'jingjian.blog.platforms.v1',
    'jingjian.blog.targets.v1',
    'jingjian.image.v1',
  ];

  /// Returns how many notes were imported (0 if nothing to do).
  static Future<int> runIfNeeded() async {
    if (kIsWeb || !Platform.isAndroid) return 0;
    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(doneKey) == true) return 0;
    try {
      final has = await _channel.invokeMethod<bool>('hasLegacy') ?? false;
      if (!has) {
        await prefs.setBool(doneKey, true);
        return 0;
      }
      final raw = await _channel.invokeMethod<String>('export');
      if (raw == null) return 0;
      final j = jsonDecode(raw) as Map<String, dynamic>;
      final data = (j['data'] as Map).cast<String, dynamic>();
      final n = await importLegacy(data, prefs: prefs, imageDir: j['imageDir'] as String?);
      await prefs.setBool(doneKey, true);
      final dir = j['imageDir'] as String?;
      if (dir != null) {
        try {
          await Directory(dir).delete(recursive: true);
        } catch (_) {}
      }
      return n;
    } catch (e) {
      debugPrint('legacy migration failed: $e'); // 下次启动再试
      return 0;
    }
  }

  static bool _isPristineWelcome(Note n) =>
      n.content.startsWith('# 欢迎使用静笺') && n.createdAt == n.updatedAt && n.folder == null;

  static List<Map<String, dynamic>> _list(Object? v) =>
      v is List ? [for (final e in v) if (e is Map) e.cast<String, dynamic>()] : const [];

  static bool _valid(Map<String, dynamic> m) =>
      m['id'] is String && (m['id'] as String).isNotEmpty && m['content'] is String;

  /// Pure import step (testable): [data] = {ls: {key: value}, overflow: {id: body}}.
  @visibleForTesting
  static Future<int> importLegacy(Map<String, dynamic> data,
      {required SharedPreferences prefs, String? imageDir, NoteStore? store, ImageStore? images}) async {
    final st = store ?? NoteStore.instance;
    final ls = (data['ls'] as Map? ?? const {}).cast<String, dynamic>();
    final overflow = (data['overflow'] as Map? ?? const {}).cast<String, dynamic>();

    final incoming = <Note>[];
    final folders = <String>{};
    final rawNotes = ls['jingjian.notes.v1'];
    if (rawNotes is String) {
      try {
        var parsed = jsonDecode(rawNotes);
        if (parsed is Map && parsed['state'] is Map) parsed = parsed['state'];
        if (parsed is Map) {
          for (final m in _list(parsed['notes'])) {
            if (!_valid(m)) continue;
            final body = overflow[m['id']];
            if (m['overflow'] == true && body is String) m['content'] = body;
            incoming.add(Note.fromJson(m));
          }
          for (final f in (parsed['folders'] as List? ?? const [])) {
            if (f is String && f.trim().isNotEmpty) folders.add(f);
          }
        }
      } catch (_) {}
    }
    final rawTrash = ls['jingjian.trash.v1'];
    if (rawTrash is String) {
      try {
        for (final m in _list(jsonDecode(rawTrash))) {
          if (!_valid(m)) continue;
          final body = overflow[m['id']];
          if (m['overflow'] == true && body is String) m['content'] = body;
          final del = (m['deletedAt'] as num?)?.toInt() ?? DateTime.now().millisecondsSinceEpoch;
          final n = Note.fromJson(m);
          if (!n.isTrashed) {
            n.trashedAt = del;
          }
          incoming.add(n);
        }
      } catch (_) {}
    }

    final existing = {for (final n in st.allNotes) n.id: n};
    var imported = 0;
    for (final n in incoming) {
      final have = existing[n.id];
      if (have != null && have.updatedAt >= n.updatedAt) continue;
      await st.insert(n);
      existing[n.id] = n;
      imported++;
    }
    if (imported > 0) {
      final live = st.allNotes.where((n) => !incoming.any((i) => i.id == n.id)).toList();
      if (live.length == 1 && _isPristineWelcome(live.single)) await st.purge(live.single.id);
    }
    for (final f in folders) {
      await st.addExtraFolder(f);
    }

    for (final k in copiedPrefs) {
      final v = ls[k];
      if (v is String && v.isNotEmpty && prefs.getString(k) == null) await prefs.setString(k, v);
    }

    final target = (images ?? ImageStore.instance).localPath;
    if (imageDir != null && target != null) {
      final src = Directory(imageDir);
      if (await src.exists()) {
        await for (final f in src.list()) {
          if (f is! File) continue;
          final dest = File(p.join(target, p.basename(f.path)));
          if (!await dest.exists()) await f.copy(dest.path);
        }
      }
    }
    return imported;
  }
}
