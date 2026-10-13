// Benchmarks (skipped by default): JJ_BENCH=1 flutter test test/bench_test.dart
import 'dart:io';
import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/app_prefs.dart';
import 'package:jingjian/services/backlinks.dart';
import 'package:jingjian/services/image_store.dart';
import 'package:jingjian/services/note_store.dart';
import 'package:jingjian/services/note_text.dart';
import 'package:jingjian/services/search_index.dart';
import 'package:shared_preferences/shared_preferences.dart';

final _r = Random(7);
const _words = ['静笺', '笔记', '同步', 'Markdown', '服务端', '协作', 'flutter', '预览', '导出', '标签', 'mermaid', '电子书', 'apple', '算法', '设计'];
String para(int n) => List.generate(n, (_) => _words[_r.nextInt(_words.length)]).join(' ');

double ms(Stopwatch s) => s.elapsedMicroseconds / 1000;
void main() {
  late Directory root;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await AppPrefs.instance.init();
    root = await Directory.systemTemp.createTemp('jjbench');
    await ImageStore.instance.init(root: root.path);
  });
  tearDownAll(() => root.delete(recursive: true));

  test('bench', () async {
    final out = StringBuffer();
    final st = NoteStore.instance;
    await st.init(root: root.path);
    final notes = List.generate(5000, (i) => Note(
          id: 'n$i', createdAt: i, updatedAt: i,
          content: '# 笔记 $i ${para(3)}\n\n${List.generate(30, (_) => para(12)).join('\n')}\n#标签${i % 20} [[笔记 ${i ~/ 2}]]\n'));
    var s = Stopwatch()..start();
    await st.replaceAll(notes);
    out.writeln('replaceAll 5000 (首次写入): ${ms(s)} ms');
    s = Stopwatch()..start();
    await st.replaceAll(List.of(st.allNotes));
    out.writeln('replaceAll 5000 (无变化再同步): ${ms(s)} ms');
    s = Stopwatch()..start();
    await st.init(root: root.path);
    out.writeln('冷启动加载 5000 篇: ${ms(s)} ms');
    s = Stopwatch()..start();
    for (var i = 0; i < 10; i++) { st.notes; }
    out.writeln('notes getter (排序) ×10: ${ms(s)} ms');
    s = Stopwatch()..start();
    for (final n in st.notes) { n.title; n.preview; }
    out.writeln('全部 title+preview: ${ms(s)} ms');
    for (final q in ['apple', '服务端 协作', 'zzz不存在']) {
      s = Stopwatch()..start();
      final all = st.notes;
      final ql = q.toLowerCase();
      final hit = all.where((n) => n.title.toLowerCase().contains(ql) || n.content.toLowerCase().contains(ql)).length;
      out.writeln('旧搜索 "$q": ${ms(s)} ms ($hit 条)');
      s = Stopwatch()..start();
      final hit2 = SearchIndex.instance.search(all, q).length;
      out.writeln('新搜索 "$q": ${ms(s)} ms ($hit2 条)');
    }
    s = Stopwatch()..start();
    tagIndex(st.notes);
    out.writeln('tagIndex 5000: ${ms(s)} ms');
    s = Stopwatch()..start();
    linksFor(st.notes.first, st.notes);
    out.writeln('backlinks 5000: ${ms(s)} ms');
    for (final lines in [10000, 50000]) {
      final big = '# 大笔记\n${List.generate(lines, (i) => i % 50 == 0 ? '## 第$i节' : para(8)).join('\n')}';
      final n = Note(id: 'big', content: big, createdAt: 0, updatedAt: 0);
      s = Stopwatch()..start();
      for (var i = 0; i < 100; i++) { n.title; }
      out.writeln('$lines 行 title ×100: ${ms(s)} ms');
      s = Stopwatch()..start();
      countText(big);
      out.writeln('$lines 行 字数统计(每次按键): ${ms(s)} ms');
      s = Stopwatch()..start();
      extractHeadings(big);
      out.writeln('$lines 行 大纲: ${ms(s)} ms');
      s = Stopwatch()..start();
      tagsIn(big);
      out.writeln('$lines 行 tagsIn: ${ms(s)} ms');
      s = Stopwatch()..start();
      countMatches(big, '静笺');
      out.writeln('$lines 行 查找计数: ${ms(s)} ms  (${(big.length / 1024).round()} KB)');
    }
    // ignore: avoid_print
    print(out);
    File('/tmp/bench.txt').writeAsStringSync(out.toString());
  }, timeout: const Timeout(Duration(minutes: 10)), skip: Platform.environment['JJ_BENCH'] == null ? '设置 JJ_BENCH=1 运行性能基准' : false);
}
