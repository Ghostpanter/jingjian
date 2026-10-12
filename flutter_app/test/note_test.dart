import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';

void main() {
  test('title strips heading markers', () {
    final note = Note(
      id: '1',
      content: '# 你好世界\n\n正文',
      createdAt: 1,
      updatedAt: 1,
    );
    expect(note.title, '你好世界');
  });

  test('json roundtrip keeps trash', () {
    final note = Note(
      id: 'abc',
      content: 'x',
      createdAt: 10,
      updatedAt: 20,
      trashedAt: 30,
    );
    final again = Note.fromJson(note.toJson());
    expect(again.id, 'abc');
    expect(again.trashedAt, 30);
    expect(again.isTrashed, isTrue);
  });

  test('empty content title', () {
    final note = Note(id: '1', content: '  \n\n', createdAt: 1, updatedAt: 1);
    expect(note.title, '未命名笔记');
  });
}
