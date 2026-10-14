import 'package:flutter/painting.dart';

import '../models/note.dart';

/// One search hit: the note and a short snippet around the first match.
class SearchHit {
  SearchHit(this.note, this.snippet, this.inTitle);
  final Note note;
  final String snippet;
  final bool inTitle;
}

/// Full-text search over notes with a lower-cased cache, so typing in the
/// search box does not re-lowercase every note body on each keystroke.
/// Space-separated terms must all match (AND), case-insensitive.
class SearchIndex {
  SearchIndex._();
  static final SearchIndex instance = SearchIndex._();

  final Map<String, (String, String, String)> _cache = {}; // id -> (content, lower, lowerTitle)

  (String, String) _lower(Note n) {
    final c = _cache[n.id];
    if (c != null && identical(c.$1, n.content)) return (c.$2, c.$3);
    final lower = n.content.toLowerCase();
    final title = n.title.toLowerCase();
    _cache[n.id] = (n.content, lower, title);
    return (lower, title);
  }

  /// Space-separated terms (AND). Text in double quotes ("..." or “...”) is one
  /// exact phrase, e.g. `"服务端 协作"` only matches the adjacent phrase.
  static List<String> terms(String query) {
    final out = <String>[];
    final q = query.toLowerCase().replaceAll(RegExp('[“”]'), '"');
    for (final m in RegExp(r'"([^"]*)"?|(\S+)').allMatches(q)) {
      final t = (m.group(1) ?? m.group(2) ?? '').trim();
      if (t.isNotEmpty && t != '"' && !out.contains(t)) out.add(t);
    }
    return out;
  }

  bool matches(Note n, List<String> terms) {
    if (terms.isEmpty) return true;
    final (lower, title) = _lower(n);
    for (final t in terms) {
      if (!lower.contains(t) && !title.contains(t)) return false;
    }
    return true;
  }

  List<Note> search(List<Note> notes, String query) {
    final t = terms(query);
    if (t.isEmpty) return notes;
    return [for (final n in notes) if (matches(n, t)) n];
  }

  /// Snippet (one line, ≤ [width] chars) around the first body match.
  String snippet(Note n, String query, {int width = 60}) {
    final t = terms(query);
    if (t.isEmpty) return n.preview;
    final (lower, _) = _lower(n);
    var at = -1;
    for (final term in t) {
      at = lower.indexOf(term);
      if (at >= 0) break;
    }
    if (at < 0) return n.preview;
    final start = (at - width ~/ 3).clamp(0, n.content.length);
    final end = (start + width).clamp(0, n.content.length);
    var s = n.content.substring(start, end).replaceAll(RegExp(r'\s+'), ' ').trim();
    if (start > 0) s = '…$s';
    if (end < n.content.length) s = '$s…';
    return s;
  }

  void forget(String id) => _cache.remove(id);
  void clear() => _cache.clear();
}

/// Spans with every case-insensitive occurrence of [terms] emphasised.
TextSpan highlightSpans(String text, List<String> terms, Color color) {
  if (terms.isEmpty || text.isEmpty) return TextSpan(text: text);
  final lower = text.toLowerCase();
  final marks = List<bool>.filled(text.length, false);
  for (final t in terms) {
    var i = lower.indexOf(t);
    while (i >= 0 && t.isNotEmpty) {
      for (var k = i; k < i + t.length && k < marks.length; k++) {
        marks[k] = true;
      }
      i = lower.indexOf(t, i + t.length);
    }
  }
  if (!marks.contains(true)) return TextSpan(text: text);
  final spans = <TextSpan>[];
  var start = 0;
  for (var i = 1; i <= text.length; i++) {
    if (i == text.length || marks[i] != marks[start]) {
      final seg = text.substring(start, i);
      spans.add(marks[start]
          ? TextSpan(text: seg, style: TextStyle(color: color, fontWeight: FontWeight.w700, backgroundColor: color.withValues(alpha: 0.18)))
          : TextSpan(text: seg));
      start = i;
    }
  }
  return TextSpan(children: spans);
}
