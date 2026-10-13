import 'package:flutter/services.dart';

import '../models/note.dart';

final _fence = RegExp(r'^\s*(```|~~~)');

/// #标签 / #a/b nested tags outside code, same spirit as old tags.ts.
final _tagRe = RegExp(r'(^|[^\p{L}\p{N}_/:?&=%.#])#([\p{L}\p{N}_/-]{1,64})', unicode: true);

final _headingLine = RegExp(r'^\s{0,3}#{1,6}\s');
final _inlineCode = RegExp(r'`[^`]*`');
final _linkTarget = RegExp(r'\]\([^)]*\)');
final _trailingSlash = RegExp(r'/+$');
final _hasLetter = RegExp(r'\p{L}', unicode: true);
final _frontMatter = RegExp(r'^---\n([\s\S]*?)\n---');
final _fmTags = RegExp(r'^tags:\s*(.+)$', multiLine: true);

List<String> tagsIn(String content) {
  final out = <String>{};
  final hasHash = content.contains('#');
  if (hasHash) {
    var inFence = false;
    var start = 0;
    while (start <= content.length) {
      var end = content.indexOf('\n', start);
      if (end < 0) end = content.length;
      final raw = content.substring(start, end);
      start = end + 1;
      if (raw.contains('```') || raw.contains('~~~')) {
        if (_fence.hasMatch(raw)) {
          inFence = !inFence;
          continue;
        }
      }
      if (inFence || !raw.contains('#')) continue;
      if (_headingLine.hasMatch(raw)) continue; // heading, not tag
      final line = raw.replaceAll(_inlineCode, ' ').replaceAll(_linkTarget, ']');
      for (final m in _tagRe.allMatches(line)) {
        final tag = m[2]!.replaceAll(_trailingSlash, '');
        if (tag.isEmpty || !_hasLetter.hasMatch(tag)) continue;
        out.add(tag);
      }
    }
  }
  // front matter `tags: [a, b]`
  if (content.startsWith('---')) {
    final fm = _frontMatter.firstMatch(content);
    if (fm != null) {
      final line = _fmTags.firstMatch(fm[1]!);
      if (line != null) {
        for (final t in line[1]!.replaceAll(RegExp(r'[\[\]"]'), '').split(RegExp(r'[,，]'))) {
          if (t.trim().isNotEmpty) out.add(t.trim());
        }
      }
    }
  }
  return out.toList();
}

/// Tags of a note, cached until its content changes (sidebar rebuilds after
/// every autosave, so re-parsing all notes there made big libraries stutter).
final Map<String, (String, List<String>)> _tagCache = {};
List<String> tagsOf(Note n) {
  final c = _tagCache[n.id];
  if (c != null && identical(c.$1, n.content)) return c.$2;
  final tags = tagsIn(n.content);
  _tagCache[n.id] = (n.content, tags);
  return tags;
}

Map<String, int> tagIndex(List<Note> notes) {
  final counts = <String, int>{};
  for (final n in notes) {
    for (final t in tagsOf(n)) {
      counts[t] = (counts[t] ?? 0) + 1;
    }
  }
  return counts;
}

bool noteHasTag(Note n, String tag) =>
    tagsOf(n).any((t) => t == tag || t.startsWith('$tag/'));

class Heading {
  Heading(this.level, this.text, this.offset);
  final int level;
  final String text;
  final int offset;
}

final _headingRe = RegExp(r'^(#{1,6})\s+(.+?)\s*#*\s*$');

List<Heading> extractHeadings(String content) {
  final out = <Heading>[];
  var offset = 0;
  var inFence = false;
  for (final line in content.split('\n')) {
    if (_fence.hasMatch(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      final m = line.startsWith('#') ? _headingRe.firstMatch(line) : null;
      if (m != null) out.add(Heading(m[1]!.length, m[2]!, offset));
    }
    offset += line.length + 1;
  }
  return out;
}

/// Characters excluding whitespace (old app's countChars) and CJK-aware words.
({int chars, int words, int lines}) countText(String content) {
  // Single pass over code units: this runs while typing, so no regexes.
  var chars = 0, cjk = 0, latin = 0, lines = content.isEmpty ? 0 : 1;
  var inWord = false;
  final n = content.length;
  for (var i = 0; i < n; i++) {
    final c = content.codeUnitAt(i);
    if (c == 10) lines++;
    final space = c == 32 || (c >= 9 && c <= 13) || c == 0xA0 || c == 0x3000 || (c >= 0x2000 && c <= 0x200A) ||
        c == 0x2028 || c == 0x2029 || c == 0x202F || c == 0x205F || c == 0xFEFF || c == 0x1680 || c == 0x85;
    if (!space) chars++;
    if ((c >= 0x3400 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff)) cjk++;
    final alnum = (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    if (alnum) {
      if (!inWord) latin++;
      inWord = true;
    } else if ((c == 0x27 || c == 0x2d) && inWord && i + 1 < n) {
      final d = content.codeUnitAt(i + 1);
      inWord = (d >= 48 && d <= 57) || (d >= 65 && d <= 90) || (d >= 97 && d <= 122);
    } else {
      inWord = false;
    }
  }
  return (chars: chars, words: cjk + latin, lines: lines);
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

/// Today's daily note ("今日日记"): the newest non-trashed note whose title is
/// the date stamp (what the 日记 template writes), or null.
Note? findDailyNote(List<Note> notes, DateTime day) {
  final stamp = dateStamp(day);
  for (final n in notes) {
    if (!n.isTrashed && n.title == stamp) return n;
  }
  return null;
}

final _taskItem = RegExp(r'^(\s*)([-*+]) \[[ xX]\] (.*)$');
final _bulletItem = RegExp(r'^(\s*)([-*+]) (.*)$');
final _orderedItem = RegExp(r'^(\s*)(\d{1,9})([.)]) (.*)$');
final _quoteLine = RegExp(r'^(\s*)> ?(.*)$');

/// Markdown list continuation: when Enter adds a newline right after a list
/// item / task / quote, start the next item; Enter on an empty item ends the
/// list. Returns null when nothing should change (never during IME
/// composition, inside code fences, or for anything but a single newline).
TextEditingValue? continueListOnEnter(TextEditingValue oldValue, TextEditingValue newValue) {
  final sel = newValue.selection;
  if (!sel.isValid || !sel.isCollapsed || !newValue.composing.isCollapsed) return null;
  final text = newValue.text;
  final at = sel.baseOffset;
  if (text.length != oldValue.text.length + 1 || at < 1 || at > text.length || text[at - 1] != '\n') return null;
  if (text.substring(0, at - 1) != oldValue.text.substring(0, at - 1)) return null;
  final lineStart = (at < 2 ? 0 : text.lastIndexOf('\n', at - 2) + 1);
  var line = text.substring(lineStart, at - 1);
  if (line.endsWith('\r')) line = line.substring(0, line.length - 1); // CRLF notes
  if (line.length > 2000) return null;
  // Inside a ``` fence? Count fence lines before this one.
  var fences = 0;
  fences = RegExp(r'^\s*(```|~~~)', multiLine: true).allMatches(text.substring(0, lineStart)).length;
  if (fences.isOdd) return null;

  String? prefix;
  String rest = '';
  RegExpMatch? m;
  if ((m = _taskItem.firstMatch(line)) != null) {
    prefix = '${m![1]}${m[2]} [ ] ';
    rest = m[3]!;
  } else if ((m = _orderedItem.firstMatch(line)) != null) {
    final next = (int.tryParse(m![2]!) ?? 0) + 1;
    prefix = '${m[1]}$next${m[3]} ';
    rest = m[4]!;
  } else if ((m = _bulletItem.firstMatch(line)) != null) {
    if (RegExp(r'^\s*([-*+])( \1)+\s*$').hasMatch(line.trimRight()) || line.trim() == '---') return null; // hr
    prefix = '${m![1]}${m[2]} ';
    rest = m[3]!;
  } else if ((m = _quoteLine.firstMatch(line)) != null) {
    prefix = '${m![1]}> ';
    rest = m[2]!;
  }
  if (prefix == null) return null;
  final indent = m?[1] ?? '';
  if (rest.trim().isEmpty && indent.isNotEmpty && !line.trimLeft().startsWith('>')) {
    // Empty nested item + Enter: outdent one level (like Obsidian/Typora).
    final cut = indent.endsWith('	') ? 1 : (indent.length >= 2 ? 2 : 1);
    final newLine = '${indent.substring(0, indent.length - cut)}${line.substring(indent.length)}';
    final out = text.substring(0, lineStart) + newLine + text.substring(at);
    return TextEditingValue(text: out, selection: TextSelection.collapsed(offset: lineStart + newLine.length));
  }
  if (rest.trim().isEmpty) {
    // Empty item + Enter: drop the marker and leave a blank line, so the
    // next paragraph is not swallowed into the list item (lazy continuation).
    final out = '${text.substring(0, lineStart)}\n${text.substring(at)}';
    return TextEditingValue(text: out, selection: TextSelection.collapsed(offset: lineStart + 1));
  }
  final out = text.substring(0, at) + prefix + text.substring(at);
  return TextEditingValue(text: out, selection: TextSelection.collapsed(offset: at + prefix.length));
}

class ListContinuationFormatter extends TextInputFormatter {
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) =>
      continueListOnEnter(oldValue, newValue) ?? newValue;
}

/// Slash menu trigger: ASCII "/" just typed (not via IME composing) on an
/// otherwise empty line outside code fences. Deliberately narrow so paths,
/// URLs and full-width "、" never open the menu.
bool slashTriggered(TextEditingValue oldValue, TextEditingValue newValue) {
  final sel = newValue.selection;
  if (!sel.isValid || !sel.isCollapsed || !newValue.composing.isCollapsed) return false;
  final text = newValue.text;
  final at = sel.baseOffset;
  if (text.length != oldValue.text.length + 1 || at < 1 || at > text.length || text[at - 1] != '/') return false;
  if (text.substring(0, at - 1) != oldValue.text.substring(0, at - 1)) return false;
  final lineStart = (at < 2 ? 0 : text.lastIndexOf('\n', at - 2) + 1);
  final nl = text.indexOf('\n', at);
  final lineEnd = nl < 0 ? text.length : nl;
  if (text.substring(lineStart, lineEnd).replaceAll('\r', '').trim() != '/') return false;
  return RegExp(r'^\s*(```|~~~)', multiLine: true).allMatches(text.substring(0, lineStart)).length.isEven;
}

/// Items for the "/" menu: (label, keywords, markup kind).
const slashItems = <(String, String, String)>[
  ('一级标题', 'h1 heading bt', 'h1'),
  ('二级标题', 'h2 heading bt', 'h2'),
  ('三级标题', 'h3 heading bt', 'h3'),
  ('待办', 'todo task db checkbox', 'task'),
  ('无序列表', 'ul list bullet lb', 'ul'),
  ('有序列表', 'ol list number', 'ol'),
  ('引用', 'quote yy', 'quote'),
  ('代码', 'code dm', 'code'),
  ('表格', 'table bg', 'table'),
  ('Mermaid 图', 'mermaid diagram tu', 'mermaid'),
  ('数学公式', 'math latex gs', 'math'),
  ('分隔线', 'hr divider fgx', 'hr'),
  ('链接', 'link lj', 'link'),
  ('双链', 'wiki link sl', 'wiki'),
];

class SlashTriggerFormatter extends TextInputFormatter {
  SlashTriggerFormatter(this.onTrigger);
  final void Function() onTrigger;
  @override
  TextEditingValue formatEditUpdate(TextEditingValue oldValue, TextEditingValue newValue) {
    if (slashTriggered(oldValue, newValue)) onTrigger();
    return newValue;
  }
}
