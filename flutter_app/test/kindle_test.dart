import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/ebook_mobi.dart';
import 'package:jingjian/services/ebook_service.dart';

void main() {
  for (final name in ['test.azw3', 'test.mobi', 'combo.mobi']) {
    test('Kindle import $name (calibre-generated)', () {
      final bytes = File('test/fixtures/$name').readAsBytesSync();
      final m = parseMobi(bytes, name);
      expect(m.title, '静笺测试书');
      expect(m.author, '测试作者');
      expect(m.images.isNotEmpty, true, reason: 'image records');
      expect(m.html.contains('mobi-image-'), true, reason: 'img src rewritten');
      final book = EbookService.instance.parse(bytes, name);
      final titles = book.chapters.map((c) => c.title).toList();
      expect(titles.where((t) => t.contains('第1章')).length, 1, reason: '$titles');
      expect(titles.any((t) => t.contains('第3章')), true, reason: '$titles');
      final all = book.chapters.map((c) => c.content).join('\n');
      expect(all.contains('这是第2章的第29段'), true);
      expect(all.contains('kindle:'), false);
      expect(all.contains('<'), false);
      // order preserved
      expect(all.indexOf('第1章的第1段') < all.indexOf('第3章的第1段'), true);
    });
  }
}
