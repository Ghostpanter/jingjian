import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/backlinks.dart';
import 'package:jingjian/services/search_index.dart';

Note n(String id, String c) => Note(id: id, createdAt: 0, updatedAt: 0, content: c);

void main() {
  test('terms: AND words, quoted phrase, dedupe, CJK quotes', () {
    expect(SearchIndex.terms('服务端  协作 '), ['服务端', '协作']);
    expect(SearchIndex.terms('"服务端 协作" x'), ['服务端 协作', 'x']);
    expect(SearchIndex.terms('“服务端 协作”'), ['服务端 协作']);
    expect(SearchIndex.terms('a A'), ['a']);
    expect(SearchIndex.terms('"" "'), isEmpty);
  });

  test('AND result is subset of every single-term result', () {
    final notes = [
      n('1', '服务端 协作'), n('2', '协作 很好 服务端'), n('3', '只有服务端'), n('4', '只有协作'), n('5', '无关'),
    ];
    final si = SearchIndex.instance..clear();
    final both = si.search(notes, '服务端 协作').map((e) => e.id).toSet();
    final a = si.search(notes, '服务端').map((e) => e.id).toSet();
    final b = si.search(notes, '协作').map((e) => e.id).toSet();
    expect(both, {'1', '2'});
    expect(a.containsAll(both) && b.containsAll(both), isTrue);
    expect(si.search(notes, '"服务端 协作"').map((e) => e.id), ['1']);
  });

  test('link cache: backlinks stay correct after edits', () {
    clearLinkCache();
    final a = n('a', '# 甲\n正文');
    var b = n('b', '# 乙\n见 [[甲]]');
    final c = n('c', '# 丙\n提到甲乙');
    expect(linksFor(a, [a, b, c]).backlinks.map((r) => r.note.id), ['b']);
    b = b.copyWith(content: '# 乙\n不再链接');
    final l = linksFor(a, [a, b, c]);
    expect(l.backlinks, isEmpty);
    b = b.copyWith(content: '# 乙\n[[甲|别名]]');
    expect(linksFor(a, [a, b, c]).backlinks.map((r) => r.note.id), ['b']);
    // renamed target: old title no longer resolves
    final a2 = a.copyWith(content: '# 甲二\n正文');
    expect(linksFor(a2, [a2, b, c]).backlinks, isEmpty);
    expect(linksFor(b, [a2, b, c]).missing, ['甲']);
  });
}
