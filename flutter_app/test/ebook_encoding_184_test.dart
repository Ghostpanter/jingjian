import 'dart:convert';
import 'dart:typed_data';

import 'package:fast_gbk/fast_gbk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/ebook_service.dart';

void main() {
  final e = EbookService.instance;
  final text = '第一章 开端\n${'静笺是一款笔记应用，支持中文。' * 50}\n第二章 继续\n内容';
  test('GBK TXT decodes', () {
    final bytes = Uint8List.fromList(gbk.encode(text));
    expect(e.decodeBytes(bytes), text);
  });
  test('UTF-8 with a truncated last char stays UTF-8', () {
    final b = utf8.encode(text);
    final cut = Uint8List.fromList(b.sublist(0, b.length - 1));
    final out = e.decodeBytes(cut);
    expect(out.startsWith('第一章 开端'), isTrue);
  });
  test('UTF-8 BOM and UTF-16LE BOM', () {
    expect(e.decodeBytes(Uint8List.fromList([0xef, 0xbb, 0xbf, ...utf8.encode('你好')])), '你好');
    final u16 = <int>[0xff, 0xfe];
    for (final c in '你好'.codeUnits) {
      u16..add(c & 0xff)..add(c >> 8);
    }
    expect(e.decodeBytes(Uint8List.fromList(u16)), '你好');
  });
  test('GBK book splits into chapters', () {
    final ch = e.splitPlainChapters(e.decodeBytes(Uint8List.fromList(gbk.encode(text))));
    expect(ch.map((c) => c.title), ['第一章 开端', '第二章 继续']);
  });
}
