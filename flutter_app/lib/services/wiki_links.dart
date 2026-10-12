import 'note_file.dart';

class WikiHit {
  WikiHit(this.target, this.line);
  final String target;
  final String line;
}

final _fenceLine = RegExp(r'^(```|~~~)');
final _wiki = RegExp(r'!?\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]');

String _snippet(String line) {
  var text = line
      .replaceAllMapped(
        RegExp(r'!?\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]'),
        (m) => (m.group(2) ?? m.group(1) ?? '').trim(),
      )
      .replaceAll(RegExp(r'`[^`]*`'), ' ')
      .replaceFirst(RegExp(r'^#{1,6}\s+'), '')
      .replaceAll(RegExp(r'[*_~>]+'), '')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  if (text.isEmpty) return '';
  return text.length > 56 ? '${text.substring(0, 56)}…' : text;
}

List<WikiHit> wikiHits(String content) {
  final hits = <WikiHit>[];
  String? fence;
  for (final raw in content.split('\n')) {
    final line = raw.replaceAll('\r', '');
    final open = _fenceLine.firstMatch(line);
    if (fence != null) {
      if (line.startsWith(fence)) fence = null;
      continue;
    }
    if (open != null) {
      fence = open.group(1);
      continue;
    }
    final prose = line.replaceAll(RegExp(r'`[^`]*`'), '');
    for (final m in _wiki.allMatches(prose)) {
      final target = m.group(1)?.trim() ?? '';
      if (target.isEmpty) continue;
      hits.add(WikiHit(target, _snippet(line)));
    }
  }
  return hits;
}

List<String> noteAliases(String content) {
  final aliases = <String>[];
  for (final m in RegExp(r'(?:^|\n)\s*aliases?\s*:\s*(.+)$', multiLine: true, caseSensitive: false)
      .allMatches(content)) {
    final raw = m.group(1) ?? '';
    for (final part in raw.split(RegExp(r'[,，]'))) {
      final a = part.trim().replaceAll(RegExp(r'^["\[]+|["\]]+$'), '');
      if (a.isNotEmpty) aliases.add(a);
    }
  }
  return aliases;
}

Map<String, String> titleIndex(List<({String id, String content})> notes) {
  final idByTitle = <String, String>{};
  void put(String title, String id) {
    final key = title.trim().toLowerCase();
    if (key.isEmpty || key == '未命名笔记' || idByTitle.containsKey(key)) return;
    idByTitle[key] = id;
  }
  for (final note in notes) {
    put(firstLineTitle(note.content), note.id);
  }
  for (final note in notes) {
    for (final alias in noteAliases(note.content)) {
      put(alias, note.id);
    }
  }
  return idByTitle;
}
