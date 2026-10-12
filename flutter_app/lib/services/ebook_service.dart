import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:uuid/uuid.dart';

import '../models/note.dart';
import 'note_store.dart';

class EbookChapter {
  EbookChapter({required this.title, required this.content});
  final String title;
  final String content;
}

class ParsedEbook {
  ParsedEbook({
    required this.title,
    this.author,
    required this.chapters,
  });
  final String title;
  final String? author;
  final List<EbookChapter> chapters;
}

class EbookService {
  EbookService._();
  static final EbookService instance = EbookService._();
  static const _uuid = Uuid();

  String decodeBytes(Uint8List bytes) {
    if (bytes.length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf) {
      return utf8.decode(bytes.sublist(3), allowMalformed: true);
    }
    return utf8.decode(bytes, allowMalformed: true);
  }

  List<EbookChapter> splitPlainChapters(String text, {String fallbackTitle = '正文'}) {
    final lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    final chapters = <EbookChapter>[];
    var title = fallbackTitle;
    final buf = StringBuffer();
    final heading = RegExp(r'^(第[一二三四五六七八九十百千零〇两\d]+[章节回部卷]|Chapter\s+\d+|[【「].+[】」])');
    void flush() {
      final body = buf.toString().trim();
      if (body.isEmpty && chapters.isEmpty) return;
      chapters.add(EbookChapter(title: title, content: '# $title\n\n$body'));
      buf.clear();
    }
    for (final line in lines) {
      if (heading.hasMatch(line.trim()) && buf.isNotEmpty) {
        flush();
        title = line.trim();
        continue;
      }
      if (heading.hasMatch(line.trim()) && buf.isEmpty) {
        title = line.trim();
        continue;
      }
      buf.writeln(line);
    }
    flush();
    if (chapters.isEmpty) {
      chapters.add(EbookChapter(title: fallbackTitle, content: '# $fallbackTitle\n\n${text.trim()}'));
    }
    return chapters;
  }

  String _stripHtml(String html) {
    return html
        .replaceAll(RegExp(r'<script[\s\S]*?</script>', caseSensitive: false), '')
        .replaceAll(RegExp(r'<style[\s\S]*?</style>', caseSensitive: false), '')
        .replaceAll(RegExp(r'<br\s*/?>', caseSensitive: false), '\n')
        .replaceAll(RegExp(r'</p>', caseSensitive: false), '\n\n')
        .replaceAll(RegExp(r'</h[1-6]>', caseSensitive: false), '\n\n')
        .replaceAll(RegExp(r'<[^>]+>'), '')
        .replaceAll('&nbsp;', ' ')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&')
        .replaceAll(RegExp(r'\n{3,}'), '\n\n')
        .trim();
  }

  ParsedEbook parseTxt(Uint8List bytes, String filename) {
    final text = decodeBytes(bytes);
    final title = filename.replaceAll(RegExp(r'\.[^.]+$'), '');
    return ParsedEbook(title: title, chapters: splitPlainChapters(text, fallbackTitle: title));
  }

  ParsedEbook parseHtml(Uint8List bytes, String filename) {
    final html = decodeBytes(bytes);
    final titleMatch = RegExp(r'<title[^>]*>([\s\S]*?)</title>', caseSensitive: false).firstMatch(html);
    final title = (titleMatch?.group(1)?.replaceAll(RegExp(r'<[^>]+>'), '').trim().isNotEmpty == true)
        ? titleMatch!.group(1)!.replaceAll(RegExp(r'<[^>]+>'), '').trim()
        : filename.replaceAll(RegExp(r'\.[^.]+$'), '');
    final text = _stripHtml(html);
    return ParsedEbook(title: title, chapters: splitPlainChapters(text, fallbackTitle: title));
  }

  ParsedEbook parseEpub(Uint8List bytes, String filename) {
    final archive = ZipDecoder().decodeBytes(bytes);
    String? opfPath;
    for (final file in archive) {
      if (file.name.endsWith('container.xml')) {
        final xml = utf8.decode(file.content as List<int>, allowMalformed: true);
        final m = RegExp(r'full-path="([^"]+)"').firstMatch(xml);
        opfPath = m?.group(1);
        break;
      }
    }
    opfPath ??= archive.files
        .map((f) => f.name)
        .firstWhere((n) => n.endsWith('.opf'), orElse: () => '');
    if (opfPath.isEmpty) {
      throw Exception('无法解析 EPUB（缺少 OPF）');
    }
    final opfFile = archive.findFile(opfPath);
    if (opfFile == null) throw Exception('无法读取 EPUB 目录');
    final opf = utf8.decode(opfFile.content as List<int>, allowMalformed: true);
    final title = RegExp(r'<dc:title[^>]*>([\s\S]*?)</dc:title>', caseSensitive: false)
            .firstMatch(opf)
            ?.group(1)
            ?.replaceAll(RegExp(r'<[^>]+>'), '')
            .trim() ??
        filename.replaceAll(RegExp(r'\.[^.]+$'), '');
    final author = RegExp(r'<dc:creator[^>]*>([\s\S]*?)</dc:creator>', caseSensitive: false)
        .firstMatch(opf)
        ?.group(1)
        ?.replaceAll(RegExp(r'<[^>]+>'), '')
        .trim();

    final spine = RegExp(r'<itemref[^>]+idref="([^"]+)"', caseSensitive: false)
        .allMatches(opf)
        .map((m) => m.group(1)!)
        .toList();
    final manifest = <String, String>{};
    for (final m in RegExp(r'<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"', caseSensitive: false)
        .allMatches(opf)) {
      manifest[m.group(1)!] = m.group(2)!;
    }
    // also href before id
    for (final m in RegExp(r'<item[^>]+href="([^"]+)"[^>]+id="([^"]+)"', caseSensitive: false)
        .allMatches(opf)) {
      manifest.putIfAbsent(m.group(2)!, () => m.group(1)!);
    }

    final baseDir = opfPath.contains('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
    final chapters = <EbookChapter>[];
    var index = 1;
    for (final id in spine) {
      final href = manifest[id];
      if (href == null) continue;
      if (!RegExp(r'\.(xhtml|html|htm|xml)$', caseSensitive: false).hasMatch(href)) continue;
      final path = _resolve(baseDir, href);
      final file = archive.findFile(path) ?? archive.findFile(Uri.decodeComponent(path));
      if (file == null) continue;
      final html = utf8.decode(file.content as List<int>, allowMalformed: true);
      final h1 = RegExp(r'<h[1-3][^>]*>([\s\S]*?)</h[1-3]>', caseSensitive: false).firstMatch(html);
      final chapTitle = h1 != null
          ? h1.group(1)!.replaceAll(RegExp(r'<[^>]+>'), '').trim()
          : '第$index 章';
      final text = _stripHtml(html);
      if (text.isEmpty) continue;
      chapters.add(EbookChapter(title: chapTitle, content: '# $chapTitle\n\n$text'));
      index += 1;
    }
    if (chapters.isEmpty) throw Exception('EPUB 中没有可读章节');
    return ParsedEbook(title: title, author: author, chapters: chapters);
  }

  String _resolve(String base, String href) {
    final clean = href.split('#').first;
    if (clean.startsWith('/')) return clean.substring(1);
    return '$base$clean'.replaceAll(r'\', '/');
  }

  ParsedEbook parse(Uint8List bytes, String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.epub')) return parseEpub(bytes, filename);
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return parseHtml(bytes, filename);
    return parseTxt(bytes, filename);
  }

  Future<List<Note>> importAsNotes(ParsedEbook book) async {
    final bookId = _uuid.v4();
    final created = <Note>[];
    for (var i = 0; i < book.chapters.length; i++) {
      final chap = book.chapters[i];
      final note = await NoteStore.instance.create(
        content: chap.content,
        folder: '电子书/${book.title}',
      );
      await NoteStore.instance.update(Note(
        id: note.id,
        content: chap.content,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        folder: '电子书/${book.title}',
        bookId: bookId,
        bookTitle: book.title,
        bookAuthor: book.author,
        chapterIndex: i,
      ));
      created.add(NoteStore.instance.byId(note.id)!);
    }
    return created;
  }
}
