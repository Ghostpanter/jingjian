import 'dart:convert';

import '../../models/note.dart';
import '../../models/sync_config.dart';
import '../note_file.dart';
import 'sync_adapter.dart';
import 'sync_http.dart';

class _ServerAdapter implements SyncAdapter {
  _ServerAdapter(this.config);
  final SyncConfig config;

  Map<String, String> get _headers => {
        'Authorization': 'Bearer ${config.serverToken.trim()}',
        'Content-Type': 'application/json',
      };

  String get _base => config.serverUrl.trim().replaceAll(RegExp(r'/+$'), '');

  @override
  Future<String> test() async {
    final response = await syncRequest(joinUrl([_base, 'health']), headers: _headers);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('服务器返回 ${response.statusCode}');
    }
    try {
      final payload = jsonDecode(response.body) as Map<String, dynamic>;
      final dir = payload['notesDir'] != null ? '，保存路径 ${payload['notesDir']}' : '';
      return '已连接$dir';
    } catch (_) {
      return '已连接';
    }
  }

  @override
  Future<List<Note>> list() async {
    final response = await syncRequest(joinUrl([_base, 'api/notes']), headers: _headers);
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('拉取失败（${response.statusCode}）');
    }
    final payload = jsonDecode(response.body) as Map<String, dynamic>;
    final notes = payload['notes'] as List? ?? [];
    return notes.map((entry) {
      final map = entry as Map<String, dynamic>;
      final raw = map['raw'] as String?;
      final id = map['id'] as String? ?? DateTime.now().millisecondsSinceEpoch.toString();
      if (raw != null && raw.startsWith('---')) return parseNoteFile(raw, id);
      if (map['content'] is String && map['id'] is String) {
        return Note.fromJson(Map<String, dynamic>.from(map));
      }
      return parseNoteFile(raw ?? '', id);
    }).toList();
  }

  @override
  Future<void> upsert(Note note) async {
    final response = await syncRequest(
      joinUrl([_base, 'api/notes', note.id]),
      method: 'PUT',
      headers: _headers,
      body: jsonEncode({...note.toJson(), 'raw': serializeNote(note)}),
    );
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('上传失败（${response.statusCode}）');
    }
  }

  @override
  Future<void> remove(String id) async {
    final response = await syncRequest(
      joinUrl([_base, 'api/notes', id]),
      method: 'DELETE',
      headers: _headers,
    );
    if (response.statusCode != 404 &&
        (response.statusCode < 200 || response.statusCode >= 300)) {
      throw Exception('删除失败（${response.statusCode}）');
    }
  }
}

SyncAdapter createServerAdapter(SyncConfig config) => _ServerAdapter(config);
