import 'dart:io';
import 'dart:math';

import 'package:flutter/painting.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/app_prefs.dart';
import 'package:jingjian/services/image_store.dart';
import 'package:jingjian/services/note_history.dart';
import 'package:jingjian/services/note_store.dart';
import 'package:jingjian/services/note_text.dart';
import 'package:jingjian/services/preview_blocks.dart';
import 'package:jingjian/services/search_index.dart';
import 'package:shared_preferences/shared_preferences.dart';

// Reference (1.8.3) implementations, to prove the fast versions match.
({int chars, int words, int lines}) oldCount(String content) {
  final chars = content.replaceAll(RegExp(r'\s'), '').length;
  final cjk = RegExp(r'[\u3400-\u9fff\uf900-\ufaff]').allMatches(content).length;
  final latin = RegExp(r'[A-Za-z0-9]+(?:[\x27-][A-Za-z0-9]+)*').allMatches(content).length;
  return (chars: chars, words: cjk + latin, lines: content.isEmpty ? 0 : '\n'.allMatches(content).length + 1);
}

String oldTitle(String content) {
  for (final raw in content.split('\n')) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    return line.replaceFirst(RegExp(r'^#{1,6}\s+'), '').replaceAll(RegExp(r'[*_`~]'), '').trim();
  }
  return '未命名笔记';
}

String oldPreview(String content) =>
    content.split('\n').map((l) => l.trim()).where((l) => l.isNotEmpty).skip(1).take(2).join(' · ');

Note n(String id, String c) => Note(id: id, content: c, createdAt: 1, updatedAt: 1);

void main() {
  final r = Random(42);
  const alphabet = ['a', 'B', '9', ' ', '\n', '\t', '中', '文', '-', "'", '#', '*', '`', '\u3000', '\u00a0', 'x', '标', '签', '/', '\r', '😀'];
  String rnd(int len) => List.generate(len, (_) => alphabet[r.nextInt(alphabet.length)]).join();

  test('fast countText / title / preview match the 1.8.3 results', () {
    for (var i = 0; i < 400; i++) {
      final s = rnd(r.nextInt(300));
      expect(countText(s), oldCount(s), reason: s);
      expect(n('x', s).title, oldTitle(s), reason: s);
      expect(n('x', s).preview, oldPreview(s), reason: s);
    }
    expect(countText("don't stop-me now 中文"), oldCount("don't stop-me now 中文"));
  });

  test('tagsIn still ignores code, headings and links; tagsOf caches by content', () {
    const c = '# 标题 #不是\n正文 #工作/项目 #读书\n`#代码` [x](http://a.com/#frag)\n```\n#围栏\n```\n#123';
    expect(tagsIn(c)..sort(), ['工作/项目', '读书']..sort());
    final note = n('t', c);
    expect(identical(tagsOf(note), tagsOf(note)), true);
    note.content = '#新标签';
    expect(tagsOf(note), ['新标签']);
    expect(tagsIn('---\ntags: [甲, 乙]\n---\n正文'), containsAll(['甲', '乙']));
  });

  test('search: AND terms, case-insensitive, snippet and highlight', () {
    final notes = [n('1', '# Apple 笔记\n关于同步服务端的说明'), n('2', '# 其他\n只有 apple'), n('3', '# 空')];
    final idx = SearchIndex.instance;
    expect(idx.search(notes, 'APPLE').map((e) => e.id), ['1', '2']);
    expect(idx.search(notes, 'apple 服务端').map((e) => e.id), ['1']);
    expect(idx.search(notes, '  ').length, 3);
    expect(idx.snippet(notes[0], '服务端'), contains('服务端'));
    notes[1].content = '# 改了\n没有了';
    expect(idx.search(notes, 'apple').map((e) => e.id), ['1']); // cache follows edits
    final span = highlightSpans('Apple apple', ['apple'], const Color(0xff00ff00));
    expect(span.children!.length, 3);
    expect(highlightSpans('无匹配', ['x'], const Color(0xff00ff00)).children, isNull);
  });

  test('Enter continues lists, ends them on empty items, skips fences and IME', () {
    TextEditingValue v(String t, int at) => TextEditingValue(text: t, selection: TextSelection.collapsed(offset: at));
    TextEditingValue? enter(String before) {
      final at = before.length;
      return continueListOnEnter(v(before, at), v('$before\n', at + 1));
    }
    expect(enter('- 苹果')!.text, '- 苹果\n- ');
    expect(enter('  * a')!.text, '  * a\n  * ');
    expect(enter('- [x] 完成')!.text, '- [x] 完成\n- [ ] ');
    expect(enter('9. 九')!.text, '9. 九\n10. ');
    expect(enter('> 引用')!.text, '> 引用\n> ');
    expect(enter('x\n- ')!.text, 'x\n\n'); // empty item ends the list, leaves a blank line
    expect(enter('- ')!.selection.baseOffset, 1);
    expect(enter('普通段落'), isNull);
    expect(enter('```\n- 代码里'), isNull);
    expect(enter('- - -'), isNull);
    final composing = TextEditingValue(
        text: '- a\n', selection: const TextSelection.collapsed(offset: 4), composing: const TextRange(start: 0, end: 3));
    expect(continueListOnEnter(v('- a', 3), composing), isNull);
    // Enter in the middle of a line keeps the tail after the new marker.
    final mid = continueListOnEnter(v('- ab', 3), v('- a\nb', 4))!;
    expect(mid.text, '- a\n- b');
    expect(mid.selection.baseOffset, 6);
    // Nested/ordered/task edge cases.
    expect(enter('- a\n  - ')!.text, '- a\n- '); // empty nested item outdents
    expect(enter('- a\n    - ')!.text, '- a\n  - ');
    expect(enter('- a\n\t- [ ] ')!.text, '- a\n- [ ] ');
    expect(enter('1. a\n   1. ')!.text, '1. a\n 1. ');
    expect(enter('  2) 二')!.text, '  2) 二\n  3) ');
    expect(enter('- [ ] 待办')!.text, '- [ ] 待办\n- [ ] ');
    expect(enter('* [X] 大写')!.text, '* [X] 大写\n* [ ] ');
    expect(enter('- [ ] ')!.text, '\n');
    expect(enter('~~~\n1. 代码'), isNull);
    expect(enter('```\nx\n```\n- 外面')!.text, '```\nx\n```\n- 外面\n- ');
    expect(enter('- a\r'), isNotNull);
    // Enter at the very start of the document must not throw.
    expect(continueListOnEnter(v('- a', 0), v('\n- a', 1)), isNull);
    expect(continueListOnEnter(v('', 0), v('\n', 1)), isNull);
  });

  test('daily note lookup matches the 日记 template title', () {
    final day = DateTime(2026, 10, 14, 9);
    final daily = noteTemplates.firstWhere((t) => t.id == 'daily').build(day);
    final notes = [n('a', '# 别的'), n('b', daily)];
    expect(findDailyNote(notes, day)?.id, 'b');
    expect(findDailyNote(notes, DateTime(2026, 10, 15)), isNull);
    notes[1].trashedAt = 5;
    expect(findDailyNote(notes, day), isNull);
  });

  test('long notes are chunked at headings; refs, lists and fences stay whole', () {
    final big = List.generate(400, (i) => i % 40 == 0 ? '\n## 第$i节\n' : '段落 $i 的内容，足够长足够长足够长。' * 4).join('\n');
    final blocks = splitPreviewBlocks(big, splitInlineMath: false);
    expect(blocks.length, greaterThan(3));
    expect(blocks.map((b) => b.text).join('\n').replaceAll('\n', ''), big.replaceAll('\n', ''));
    expect(splitPreviewBlocks('$big\n\n[ref]: http://x', splitInlineMath: false).length, 1);
    final small = '# a\n\ntext\n\n# b\n\nmore';
    expect(splitPreviewBlocks(small, splitInlineMath: false).length, 1);
    final fenced = '${'x' * 7000}\n\n```\n\n# 不是标题\n```\n';
    expect(splitPreviewBlocks(fenced, splitInlineMath: false).length, 2); // text | fence
  });

  group('store + history', () {
    late Directory root;
    setUpAll(() async {
      SharedPreferences.setMockInitialValues({});
      await AppPrefs.instance.init();
      root = await Directory.systemTemp.createTemp('jj184');
      await ImageStore.instance.init(root: root.path);
      await NoteHistory.instance.init(root: root.path);
      await NoteStore.instance.init(root: root.path);
    });
    tearDownAll(() => root.delete(recursive: true));

    test('history: throttled autos, forced sync/restore, caps, cleared on purge', () async {
      final h = NoteHistory.instance;
      const key = 'k.json';
      final t0 = DateTime(2026, 10, 14, 1);
      await h.record(key, 'v1', 'v2', now: t0);
      await h.record(key, 'v2', 'v3', now: t0.add(const Duration(minutes: 3))); // throttled
      expect(h.versions(key).map((v) => v.content), ['v1']);
      await h.record(key, 'v3', 'v4', reason: 'sync', now: t0.add(const Duration(minutes: 4)));
      await h.record(key, 'v4', 'v5', now: t0.add(const Duration(minutes: 20)));
      expect(h.versions(key).map((v) => v.content), ['v4', 'v3', 'v1']);
      expect(h.versions(key)[1].reason, 'sync');
      for (var i = 0; i < 50; i++) {
        await h.record(key, 'x$i', 'y', reason: 'sync');
      }
      expect(h.versions(key).length, NoteHistory.maxVersions);
      await h.record(key, 'a' * (NoteHistory.maxNoteChars + 1), 'b', reason: 'sync');
      expect(h.versions(key).first.content, 'x49'); // too big: skipped
    });

    test('update keeps old text; replaceAll writes only changed notes', () async {
      final st = NoteStore.instance;
      final a = await st.create(content: '# 原文');
      await st.update(a.copyWith(content: '# 改后'));
      final versions = NoteHistory.instance.versions(NoteStore.keyFor(a.id));
      expect(versions.first.content, '# 原文');
      final dir = Directory('${root.path}/jingjian/notes');
      final f = File('${dir.path}/${NoteStore.keyFor(a.id)}');
      final before = f.lastModifiedSync();
      await Future<void>.delayed(const Duration(milliseconds: 1100));
      await st.replaceAll(List.of(st.allNotes));
      expect(f.lastModifiedSync(), before); // untouched
      final changed = st.allNotes.map((x) => x.id == a.id ? x.copyWith(content: '# 远端') : x).toList();
      await st.replaceAll(changed);
      expect(st.byId(a.id)!.content, '# 远端');
      expect(NoteHistory.instance.versions(NoteStore.keyFor(a.id)).first.reason, 'sync');
      await st.purge(a.id);
      expect(NoteHistory.instance.versions(NoteStore.keyFor(a.id)), isEmpty);
    });
  });

  test('slash trigger is narrow', () {
    TextEditingValue v(String t, {TextRange composing = TextRange.empty}) =>
        TextEditingValue(text: t, selection: TextSelection.collapsed(offset: t.length), composing: composing);
    expect(slashTriggered(v('a\n'), v('a\n/')), isTrue);
    expect(slashTriggered(v(''), v('/')), isTrue);
    expect(slashTriggered(v('  '), v('  /')), isTrue);
    expect(slashTriggered(v('usr'), v('usr/')), isFalse);
    expect(slashTriggered(v('/'), v('//')), isFalse);
    expect(slashTriggered(v(''), v('、')), isFalse);
    expect(slashTriggered(v(''), v('/', composing: const TextRange(start: 0, end: 1))), isFalse);
    expect(slashTriggered(v('```\n'), v('```\n/')), isFalse);
    // "/" typed before existing text on the same line
    expect(slashTriggered(const TextEditingValue(text: 'x', selection: TextSelection.collapsed(offset: 0)),
        const TextEditingValue(text: '/x', selection: TextSelection.collapsed(offset: 1))), isFalse);
  });
}
