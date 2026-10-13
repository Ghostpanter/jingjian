import 'dart:convert';

import 'storage/blob_store.dart';

/// One saved version of a note.
class NoteVersion {
  NoteVersion(this.time, this.content, this.reason);
  final int time; // ms since epoch
  final String content;
  final String reason; // auto | sync | restore | replace

  Map<String, dynamic> toJson() => {'t': time, 'c': content, 'r': reason};
  static NoteVersion? fromJson(Object? j) {
    if (j is! Map || j['t'] is! num || j['c'] is! String) return null;
    return NoteVersion((j['t'] as num).toInt(), j['c'] as String, j['r'] is String ? j['r'] as String : 'auto');
  }
}

/// Local version history ("历史版本"): before a note's text is overwritten we
/// keep the old text, at most once per [interval] while typing, always for
/// sync / restore / replace-all. Kept per note, newest first, bounded in
/// count and bytes. Never synced, never touches the note files themselves.
class NoteHistory {
  NoteHistory._();
  static final NoteHistory instance = NoteHistory._();

  static const maxVersions = 30;
  static const maxNoteChars = 200000; // bigger notes are not versioned
  static const maxBytesPerNote = 1500000;
  static const interval = Duration(minutes: 10);

  BlobStore? _blobs;
  final Map<String, int> _lastAuto = {};
  bool get ready => _blobs != null;

  Future<void> init({String? root}) async {
    _blobs = await BlobStore.open('history', root: root);
    _lastAuto.clear();
  }

  static String _key(String noteKey) => noteKey.replaceAll('.json', '.hist.json');

  List<NoteVersion> versions(String noteKey) {
    final raw = _blobs?.readSync(_key(noteKey));
    if (raw == null) return [];
    try {
      final list = jsonDecode(utf8.decode(raw));
      if (list is! List) return [];
      return [for (final j in list) ?NoteVersion.fromJson(j)];
    } catch (_) {
      return [];
    }
  }

  /// Remember [oldContent] before it is replaced by [newContent].
  Future<void> record(String noteKey, String oldContent, String newContent,
      {String reason = 'auto', DateTime? now}) async {
    final blobs = _blobs;
    if (blobs == null || oldContent == newContent || oldContent.trim().isEmpty) return;
    if (oldContent.length > maxNoteChars) return;
    final t = (now ?? DateTime.now()).millisecondsSinceEpoch;
    if (reason == 'auto') {
      final last = _lastAuto[noteKey];
      if (last != null && t - last < interval.inMilliseconds) return;
    }
    final list = versions(noteKey);
    if (list.isNotEmpty && list.first.content == oldContent) {
      _lastAuto[noteKey] = t;
      return;
    }
    list.insert(0, NoteVersion(t, oldContent, reason));
    while (list.length > maxVersions) {
      list.removeLast();
    }
    var bytes = utf8.encode(jsonEncode([for (final v in list) v.toJson()]));
    while (bytes.length > maxBytesPerNote && list.length > 1) {
      list.removeLast();
      bytes = utf8.encode(jsonEncode([for (final v in list) v.toJson()]));
    }
    _lastAuto[noteKey] = t;
    await blobs.write(_key(noteKey), bytes);
  }

  Future<void> clear(String noteKey) async {
    _lastAuto.remove(noteKey);
    await _blobs?.delete(_key(noteKey));
  }
}
