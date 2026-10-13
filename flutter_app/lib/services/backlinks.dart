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

/// Outgoing links, backlinks, unlinked mentions (old app's backlinks panel).
NoteLinks linksFor(Note note, List<Note> all) {
  final idx = titleIndex([for (final n in all) (id: n.id, content: n.content)]);
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
    final hit = wikiHits(n.content).where((h) => idx[h.target.toLowerCase()] == note.id).firstOrNull;
    if (hit != null) {
      back.add(LinkRef(n, hit.line));
      continue;
    }
    final lower = n.content.toLowerCase();
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
