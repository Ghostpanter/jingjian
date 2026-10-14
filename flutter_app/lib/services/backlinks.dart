import '../models/note.dart';
import 'note_file.dart';
import 'wiki_links.dart';

class LinkRef {
  LinkRef(this.note, this.snippet);
  final Note note;
  final String snippet;
}

class NoteLinks {
  NoteLinks(this.outgoing, this.missing, this.backlinks, this.mentions);
  final List<Note> outgoing;
  final List<String> missing;
  final List<LinkRef> backlinks;
  final List<LinkRef> mentions;
}

class _LinkInfo {
  _LinkInfo(this.content)
      : hits = wikiHits(content),
        title = firstLineTitle(content),
        aliases = noteAliases(content);
  final String content;
  final List<WikiHit> hits;
  final String title;
  final List<String> aliases;
  String? _lower;
  String get lower => _lower ??= content.toLowerCase();
}

/// Incremental per-note cache (parsed links/title/aliases), reused while the
/// note's content string is unchanged — like the tag cache.
final Map<String, _LinkInfo> _linkCache = {};
_LinkInfo _info(Note n) {
  final c = _linkCache[n.id];
  if (c != null && (identical(c.content, n.content) || c.content == n.content)) return c;
  return _linkCache[n.id] = _LinkInfo(n.content);
}

void clearLinkCache() => _linkCache.clear();

/// Parse notes in small slices when idle, so the first 双链 panel opens fast.
Future<void> warmLinkCache(List<Note> all) async {
  for (var i = 0; i < all.length; i++) {
    _info(all[i]);
    if (i % 200 == 199) await Future<void>.delayed(const Duration(milliseconds: 16));
  }
}

Map<String, String> _titleIndex(List<Note> all) {
  final idByTitle = <String, String>{};
  void put(String title, String id) {
    final key = title.trim().toLowerCase();
    if (key.isEmpty || key == '未命名笔记' || idByTitle.containsKey(key)) return;
    idByTitle[key] = id;
  }
  for (final n in all) {
    put(_info(n).title, n.id);
  }
  for (final n in all) {
    for (final a in _info(n).aliases) {
      put(a, n.id);
    }
  }
  return idByTitle;
}

/// Outgoing links, backlinks, unlinked mentions (old app's backlinks panel).
NoteLinks linksFor(Note note, List<Note> all) {
  if (_linkCache.length > all.length * 2 + 64) {
    final live = {for (final n in all) n.id};
    _linkCache.removeWhere((k, _) => !live.contains(k));
  }
  final idx = _titleIndex(all);
  final byId = {for (final n in all) n.id: n};
  final outgoing = <Note>[];
  final missing = <String>[];
  final seen = <String>{};
  for (final h in wikiHits(note.content)) {
    final id = idx[h.target.toLowerCase()];
    if (id == null) {
      if (!missing.contains(h.target)) missing.add(h.target);
    } else if (id != note.id && seen.add(id)) {
      outgoing.add(byId[id]!);
    }
  }
  final names = <String>{
    firstLineTitle(note.content).trim().toLowerCase(),
    ...noteAliases(note.content).map((a) => a.toLowerCase()),
  }..removeWhere((s) => s.isEmpty || s == '未命名笔记');
  final back = <LinkRef>[];
  final mentions = <LinkRef>[];
  if (names.isEmpty) return NoteLinks(outgoing, missing, back, mentions);
  for (final n in all) {
    if (n.id == note.id) continue;
    final hit = _info(n).hits.where((h) => idx[h.target.toLowerCase()] == note.id).firstOrNull;
    if (hit != null) {
      back.add(LinkRef(n, hit.line));
      continue;
    }
    final lower = _info(n).lower;
    for (final name in names) {
      if (name.length < 2) continue;
      final i = lower.indexOf(name);
      if (i >= 0) {
        final s = (i - 20).clamp(0, n.content.length);
        final e = (i + name.length + 30).clamp(0, n.content.length);
        mentions.add(LinkRef(n, n.content.substring(s, e).replaceAll('\n', ' ')));
        break;
      }
    }
  }
  return NoteLinks(outgoing, missing, back, mentions);
}
