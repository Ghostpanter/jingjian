import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/bookshelf.dart';

Note _n(String id, {String? folder, String? bookId, String? bookTitle, int? idx, int t = 0}) => Note(
      id: id, content: '# ch$id', folder: folder, bookId: bookId, bookTitle: bookTitle, chapterIndex: idx,
      createdAt: 1000 + t, updatedAt: 9000 - t);

void main() {
  test('书架按书名分组，章节按目录顺序', () {
    final notes = [
      _n('3', folder: '电子书/三体', bookId: 'b1', bookTitle: '三体', idx: 2),
      _n('1', folder: '电子书/三体', bookId: 'b1', bookTitle: '三体', idx: 0),
      _n('2', folder: '电子书/三体', bookId: 'b1', bookTitle: '三体', idx: 1),
      _n('x'),
    ];
    final books = bookshelf(notes);
    expect(books.length, 1);
    expect(books.first.title, '三体');
    expect(books.first.chapters.map((c) => c.id), ['1', '2', '3']);
    expect(bookChapters(notes, 'b1').length, 3);
  });
  test('书名缺失时回退到文件夹名', () {
    final b = bookshelf([_n('1', folder: '电子书/活着', bookId: 'b')]);
    expect(b.first.title, '活着');
  });
  test('纯电子书文件夹从目录树隐藏，混合文件夹保留', () {
    final notes = [_n('1', folder: '电子书/A', bookId: 'b'), _n('2', folder: '电子书/B')];
    expect(isPureBookFolder('电子书/A', notes), isTrue);
    expect(isPureBookFolder('电子书/B', notes), isFalse);
    expect(isPureBookFolder('电子书', notes), isFalse);
    expect(isPureBookFolder('工作', notes), isFalse);
  });
}
