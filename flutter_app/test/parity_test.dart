import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/backlinks.dart';
import 'package:jingjian/services/ebook_mobi.dart';
import 'package:jingjian/services/ebook_service.dart';
import 'package:jingjian/services/export_service.dart';
import 'package:jingjian/services/html_markdown.dart';
import 'package:jingjian/services/note_text.dart';
import 'package:jingjian/services/sync/sync_images.dart';
import 'package:jingjian/theme/app_theme.dart';
import 'package:jingjian/widgets/markdown_preview.dart';
import 'package:shared_preferences/shared_preferences.dart';

Note n(String id, String content) => Note(id: id, content: content, createdAt: 1, updatedAt: 1);

void main() {
  test('sync image trailer split (old app format)', () {
    final b64 = base64Encode([1, 2, 3]);
    final raw = '# T\n\n![](images/abc-1)\n%%JINGJIAN-IMAGES%%\nabc-1 image/png $b64\n%%END-JINGJIAN-IMAGES%%\n';
    final s = splitImageTrailer(raw);
    expect(s.content.trim(), '# T\n\n![](images/abc-1)');
    expect(s.images.length, 1);
    expect(splitImageTrailer('plain').images, isEmpty);
  });

  test('PalmDoc decompress', () {
    // literal "ab", then space+char pair (0xC0 ^ 'c'= ' c'), then raw byte copy (1 byte 'x')
    final data = Uint8List.fromList([0x61, 0x62, 0x80 ^ 0x63 ^ 0x40 | 0x80, 0x01, 0x78]);
    final out = latin1.decode(decompressPalmDoc(data));
    expect(out.startsWith('ab'), true);
    expect(out.endsWith('x'), true);
  });

  test('tags and headings', () {
    final c = '---\ntags: [读书, 工作]\n---\n# 标题 #不是\n正文 #想法 和 #项目/静笺 链接 http://a.com/#frag\n```\n#code\n```';
    final tags = tagsIn(c);
    expect(tags, containsAll(['读书', '工作', '想法', '项目/静笺']));
    expect(tags.contains('code'), false);
    expect(tags.contains('frag'), false);
    final hs = extractHeadings('# A\n```\n# no\n```\n## B');
    expect(hs.map((h) => h.text).toList(), ['A', 'B']);
  });

  test('applyMarkup bold/heading/task', () {
    var v = const TextEditingValue(text: 'hello', selection: TextSelection(baseOffset: 0, extentOffset: 5));
    expect(applyMarkup(v, 'bold').text, '**hello**');
    v = const TextEditingValue(text: 'line', selection: TextSelection.collapsed(offset: 2));
    expect(applyMarkup(v, 'h2').text, '## line');
    expect(applyMarkup(applyMarkup(v, 'task'), 'task').text, 'line');
  });

  test('find / replace with regex groups', () {
    expect(findAll('Aa aA', 'a').length, 4);
    expect(findAll('Aa aA', 'a', caseSensitive: true).length, 2);
    expect(replaceAllMatches('2026-10', r'(\d+)-(\d+)', r'$2/$1', regex: true), '10/2026');
  });

  test('count CJK + latin', () {
    final c = countText('你好 world\n第二行');
    expect(c.words, 6);
    expect(c.lines, 2);
  });

  test('backlinks & unlinked mentions', () {
    final a = n('a', '# Alpha\n');
    final b = n('b', '# Beta\n见 [[Alpha]]');
    final c = n('c', '# Gamma\n提到 alpha 但没链接');
    final l = linksFor(a, [a, b, c]);
    expect(l.backlinks.single.note.id, 'b');
    expect(l.mentions.single.note.id, 'c');
    expect(linksFor(b, [a, b, c]).outgoing.single.id, 'a');
  });

  test('txt chapters + html to markdown', () {
    final book = EbookService.instance.parseTxt(
        Uint8List.fromList(utf8.encode('第一章 开始\n内容一\n第二章 继续\n内容二')), '书.txt');
    expect(book.chapters.length, 2);
    expect(htmlToMarkdown('<h1>T</h1><p>a <b>b</b></p>').contains('**b**'), true);
    expect(looksLikeMobi(Uint8List(10), 'x.mobi'), true);
  });

  test('epub export is valid zip with stored mimetype first', () async {
    final bytes = await ExportService.instance.toEpub([n('a', '# 一\n正文'), n('b', '# 二\n正文')], title: '测试');
    final z = ZipDecoder().decodeBytes(bytes);
    expect(z.files.first.name, 'mimetype');
    expect(utf8.decode(z.files.first.content as List<int>), 'application/epub+zip');
    expect(z.files.any((f) => f.name.endsWith('.opf')), true);
  });

  testWidgets('OLED palette only when dark; preview renders inline math & wiki', (tester) async {
    SharedPreferences.setMockInitialValues({});
    final t = ThemeController.instance;
    await t.init();
    await t.setTheme(ThemeId.paper);
    await t.setOled(true);
    expect(t.oledActive, false);
    expect(JingjianColors.paper == const Color(0xFF000000), false);
    await t.setTheme(ThemeId.ink);
    expect(t.oledActive, true);
    expect(JingjianColors.paper, const Color(0xFF000000));
    expect(JingjianColors.border == const Color(0xFF000000), false);
    await t.setOled(false);
    expect(JingjianColors.paper == const Color(0xFF000000), false);

    String? tapped;
    await tester.pumpWidget(MaterialApp(
      home: Scaffold(
        body: MarkdownPreview(content: '# H\n\n质能 \$E=mc^2\$ 见 [[笔记甲|甲]]\n\n| a | b |\n|---|---|\n| 1 | 2 |', onWikiTap: (s) => tapped = s),
      ),
    ));
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
    expect(find.textContaining('质能', findRichText: true), findsWidgets);
    expect(tapped, isNull);
  });
}
