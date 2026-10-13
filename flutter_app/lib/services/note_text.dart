import 'package:flutter/services.dart';

import '../models/note.dart';

final _fence = RegExp(r'^\s*(```|~~~)');

/// #标签 / #a/b nested tags outside code, same spirit as old tags.ts.
final _tagRe = RegExp(r'(^|[^\p{L}\p{N}_/:?&=%.#])#([\p{L}\p{N}_/-]{1,64})', unicode: true);

List<String> tagsIn(String content) {
  final out = <String>{};
  var inFence = false;
  for (final raw in content.split('\n')) {
    if (_fence.hasMatch(raw)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (RegExp(r'^\s{0,3}#{1,6}\s').hasMatch(raw)) continue; // heading, not tag
    final line = raw.replaceAll(RegExp(r'`[^`]*`'), ' ').replaceAll(RegExp(r'\]\([^)]*\)'), ']');
    for (final m in _tagRe.allMatches(line)) {
      final tag = m[2]!.replaceAll(RegExp(r'/+$'), '');
      if (tag.isEmpty || !RegExp(r'\p{L}', unicode: true).hasMatch(tag)) continue;
      out.add(tag);
    }
  }
  // front matter `tags: [a, b]`
  final fm = RegExp(r'^---\n([\s\S]*?)\n---').firstMatch(content);
  if (fm != null) {
    final line = RegExp(r'^tags:\s*(.+)$', multiLine: true).firstMatch(fm[1]!);
    if (line != null) {
      for (final t in line[1]!.replaceAll(RegExp(r'[\[\]"]'), '').split(RegExp(r'[,，]'))) {
        if (t.trim().isNotEmpty) out.add(t.trim());
      }
    }
  }
  return out.toList();
}

Map<String, int> tagIndex(List<Note> notes) {
  final counts = <String, int>{};
  for (final n in notes) {
    for (final t in tagsIn(n.content)) {
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}

bool noteHasTag(Note n, String tag) =>
    tagsIn(n.content).any((t) => t == tag || t.startsWith('$tag/'));

class Heading {
  Heading(this.level, this.text, this.offset);
  final int level;
  final String text;
  final int offset;
}

List<Heading> extractHeadings(String content) {
  final out = <Heading>[];
  var offset = 0;
  var inFence = false;
  for (final line in content.split('\n')) {
    if (_fence.hasMatch(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      final m = RegExp(r'^(#{1,6})\s+(.+?)\s*#*\s*$').firstMatch(line);
      if (m != null) out.add(Heading(m[1]!.length, m[2]!, offset));
    }
    offset += line.length + 1;
  }
  return out;
}

/// Characters excluding whitespace (old app's countChars) and CJK-aware words.
({int chars, int words, int lines}) countText(String content) {
  final chars = content.replaceAll(RegExp(r'\s'), '').length;
  final cjk = RegExp(r'[\u3400-\u9fff\uf900-\ufaff]').allMatches(content).length;
  final latin = RegExp(r'[A-Za-z0-9]+(?:[\x27-][A-Za-z0-9]+)*').allMatches(content).length;
  return (chars: chars, words: cjk + latin, lines: content.isEmpty ? 0 : '\n'.allMatches(content).length + 1);
}

class NoteTemplate {
  const NoteTemplate(this.id, this.name, this.hint, this.build);
  final String id;
  final String name;
  final String hint;
  final String Function(DateTime now) build;
}

String _two(int n) => n.toString().padLeft(2, '0');
String dateStamp(DateTime d) => '${d.year}-${_two(d.month)}-${_two(d.day)}';
String isoLocal(DateTime d) {
  final off = d.timeZoneOffset;
  final sign = off.isNegative ? '-' : '+';
  return '${dateStamp(d)}T${_two(d.hour)}:${_two(d.minute)}:${_two(d.second)}$sign${_two(off.inHours.abs())}:${_two(off.inMinutes.abs() % 60)}';
}

final noteTemplates = <NoteTemplate>[
  NoteTemplate('blank', '空白', '从第一行开始写', (_) => ''),
  NoteTemplate('daily', '日记', '当天日期作标题', (d) => '# ${dateStamp(d)}\n\n'),
  NoteTemplate('meeting', '会议', '时间、参与、决议',
      (d) => '# 会议 ${dateStamp(d)}\n\n- 时间：${dateStamp(d)} ${_two(d.hour)}:${_two(d.minute)}\n- 参与：\n- 议题：\n- 决议：\n\n'),
  NoteTemplate('blog', '博客文章', '带 YAML，可直接发布',
      (d) => '---\ntitle: ""\ndate: ${isoLocal(d)}\ndraft: false\n---\n\n# \n\n'),
  NoteTemplate('todo', '待办', '任务清单', (d) => '# 待办 ${dateStamp(d)}\n\n- [ ] \n'),
];

/// Wrap / prefix markup around the selection. Returns the new value.
TextEditingValue applyMarkup(TextEditingValue v, String kind) {
  final text = v.text;
  final sel = v.selection.isValid ? v.selection : TextSelection.collapsed(offset: text.length);
  final start = sel.start, end = sel.end;
  final selected = text.substring(start, end);

  TextEditingValue wrap(String l, String r, String placeholder) {
    final inner = selected.isEmpty ? placeholder : selected;
    final next = text.replaceRange(start, end, '$l$inner$r');
    return TextEditingValue(
      text: next,
      selection: TextSelection(baseOffset: start + l.length, extentOffset: start + l.length + inner.length),
    );
  }

  TextEditingValue linePrefix(String prefix) {
    final lineStart = text.lastIndexOf('\n', start == 0 ? 0 : start - 1) + 1;
    final lineEndIdx = text.indexOf('\n', end);
    final lineEnd = lineEndIdx < 0 ? text.length : lineEndIdx;
    final block = text.substring(lineStart, lineEnd);
    final lines = block.split('\n');
    final allHave = lines.every((l) => l.startsWith(prefix));
    final out = lines.map((l) => allHave ? l.substring(prefix.length) : '$prefix${l.replaceFirst(RegExp(r'^(#{1,6} |- \[ \] |- |> |\d+\. )'), '')}').join('\n');
    final next = text.replaceRange(lineStart, lineEnd, out);
    return TextEditingValue(text: next, selection: TextSelection.collapsed(offset: lineStart + out.length));
  }

  TextEditingValue insert(String s, {int caretBack = 0}) {
    final next = text.replaceRange(start, end, s);
    return TextEditingValue(text: next, selection: TextSelection.collapsed(offset: start + s.length - caretBack));
  }

  switch (kind) {
    case 'bold':
      return wrap('**', '**', '加粗');
    case 'italic':
      return wrap('*', '*', '斜体');
    case 'strike':
      return wrap('~~', '~~', '删除线');
    case 'code':
      return selected.contains('\n') ? wrap('\n```\n', '\n```\n', '代码') : wrap('`', '`', '代码');
    case 'h1':
      return linePrefix('# ');
    case 'h2':
      return linePrefix('## ');
    case 'h3':
      return linePrefix('### ');
    case 'ul':
      return linePrefix('- ');
    case 'ol':
      return linePrefix('1. ');
    case 'task':
      return linePrefix('- [ ] ');
    case 'quote':
      return linePrefix('> ');
    case 'link':
      return selected.isEmpty ? insert('[链接文字](https://)', caretBack: 1) : wrap('[', '](https://)', '');
    case 'wiki':
      return wrap('[[', ']]', '笔记名');
    case 'table':
      final pre = start > 0 && text[start - 1] != '\n' ? '\n\n' : '';
      return insert('$pre| 列 1 | 列 2 | 列 3 |\n| --- | --- | --- |\n|  |  |  |\n');
    case 'hr':
      return insert('\n\n---\n\n');
    case 'math':
      return wrap(r'$', r'$', 'E=mc^2');
    case 'mermaid':
      return insert('\n```mermaid\ngraph LR\n  A --> B\n```\n');
  }
  return v;
}

/// Find all matches (case-insensitive optional, regex optional).
List<TextRange> findAll(String text, String query, {bool caseSensitive = false, bool regex = false}) {
  if (query.isEmpty) return [];
  final re = findPattern(query, caseSensitive: caseSensitive, regex: regex);
  if (re == null) return [];
  return re
      .allMatches(text)
      .where((m) => m.end > m.start)
      .map((m) => TextRange(start: m.start, end: m.end))
      .take(5000)
      .toList();
}

RegExp? findPattern(String query, {bool caseSensitive = false, bool regex = false}) {
  if (query.isEmpty) return null;
  try {
    return RegExp(regex ? query : RegExp.escape(query), caseSensitive: caseSensitive, multiLine: true, unicode: regex);
  } catch (_) {
    try {
      return RegExp(regex ? query : RegExp.escape(query), caseSensitive: caseSensitive, multiLine: true);
    } catch (_) {
      return null;
    }
  }
}

/// Expand `$1`..`$99`, `$&`/`$0` (whole match) and `$$` (literal $), JS-style.
String expandReplacement(Match m, String replacement) {
  return replacement.replaceAllMapped(RegExp(r'\$(\$|&|\d{1,2})'), (g) {
    final t = g[1]!;
    if (t == r'$') return r'$';
    if (t == '&') return m.group(0) ?? '';
    var n = int.parse(t);
    if (n > m.groupCount && t.length == 2) {
      // "$12" with only one group means group 1 followed by "2".
      n = int.parse(t[0]);
      if (n <= m.groupCount) return '${m.group(n) ?? ''}${t[1]}';
      return g[0]!;
    }
    if (n > m.groupCount) return g[0]!;
    return m.group(n) ?? '';
  });
}

/// Number of places [replaceAllMatches] would change (empty matches count).
int countMatches(String text, String query, {bool caseSensitive = false, bool regex = false}) {
  final re = findPattern(query, caseSensitive: caseSensitive, regex: regex);
  return re == null ? 0 : re.allMatches(text).length;
}

String replaceAllMatches(String text, String query, String replacement,
    {bool caseSensitive = false, bool regex = false}) {
  final re = findPattern(query, caseSensitive: caseSensitive, regex: regex);
  if (re == null) return text;
  return regex ? text.replaceAllMapped(re, (m) => expandReplacement(m, replacement)) : text.replaceAll(re, replacement);
}

/// Replace exactly the match that starts at [start] (keeps regex context such
/// as ^, lookbehind). Returns null if nothing matches there.
({String text, int end})? replaceMatchAt(String text, int start, String query, String replacement,
    {bool caseSensitive = false, bool regex = false}) {
  final re = findPattern(query, caseSensitive: caseSensitive, regex: regex);
  if (re == null) return null;
  Match? m;
  for (final x in re.allMatches(text, start)) {
    if (x.start == start) m = x;
    break;
  }
  if (m == null) return null;
  final rep = regex ? expandReplacement(m, replacement) : replacement;
  return (text: text.replaceRange(m.start, m.end, rep), end: m.start + rep.length);
}
