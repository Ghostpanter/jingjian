import 'dart:convert';

import 'package:shared_preferences/shared_preferences.dart';

import '../models/blog_config.dart';
import '../models/sync_config.dart';

class AppPrefs {
  AppPrefs._();
  static final AppPrefs instance = AppPrefs._();

  SharedPreferences? _prefs;
  static const _syncKey = 'jingjian.sync.v1';
  static const _tombKey = 'jingjian.sync.tombstones.v1';
  static const _blogKey = 'jingjian.blog.v1';
  static const _publishedKey = 'jingjian.blog.published.v1';
  static const _extraFoldersKey = 'jingjian.folders.extra.v1';

  Future<void> init() async {
    _prefs ??= await SharedPreferences.getInstance();
  }

  SyncConfig readSyncConfig() {
    final raw = _prefs?.getString(_syncKey);
    if (raw == null) return SyncConfig();
    try {
      return SyncConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return SyncConfig();
    }
  }

  Future<void> writeSyncConfig(SyncConfig config) async {
    await _prefs?.setString(_syncKey, jsonEncode(config.toJson()));
  }

  Map<String, int> readTombstones() {
    final raw = _prefs?.getString(_tombKey);
    if (raw == null) return {};
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map.map((k, v) => MapEntry(k, (v as num).toInt()));
    } catch (_) {
      return {};
    }
  }

  Future<void> writeTombstones(Map<String, int> tombstones) async {
    await _prefs?.setString(_tombKey, jsonEncode(tombstones));
  }

  BlogConfig readBlogConfig() {
    final raw = _prefs?.getString(_blogKey);
    if (raw == null) return BlogConfig();
    try {
      return BlogConfig.fromJson(jsonDecode(raw) as Map<String, dynamic>);
    } catch (_) {
      return BlogConfig();
    }
  }

  Future<void> writeBlogConfig(BlogConfig config) async {
    await _prefs?.setString(_blogKey, jsonEncode(config.toJson()));
  }

  Map<String, String> readPublished() {
    final raw = _prefs?.getString(_publishedKey);
    if (raw == null) return {};
    try {
      final map = jsonDecode(raw) as Map<String, dynamic>;
      return map.map((k, v) => MapEntry(k, v.toString()));
    } catch (_) {
      return {};
    }
  }

  Future<void> rememberPublished(String noteId, String path) async {
    final map = readPublished();
    map[noteId] = path;
    await _prefs?.setString(_publishedKey, jsonEncode(map));
  }

  List<String> readExtraFolders() {
    final raw = _prefs?.getString(_extraFoldersKey);
    if (raw == null) return [];
    try {
      return (jsonDecode(raw) as List).map((e) => e.toString()).toList();
    } catch (_) {
      return [];
    }
  }

  Future<void> writeExtraFolders(List<String> folders) async {
    await _prefs?.setString(_extraFoldersKey, jsonEncode(folders));
  }
}
