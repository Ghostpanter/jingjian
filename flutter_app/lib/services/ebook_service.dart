import 'package:fast_gbk/fast_gbk.dart';
import 'dart:convert';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:uuid/uuid.dart';

import '../models/note.dart';
import 'ebook_mobi.dart';
import 'html_markdown.dart';
import 'image_store.dart';
import 'note_store.dart';

class EbookChapter {
  EbookChapter({required this.title, required this.content});
  final String title;
  String content; // markdown
}

class ParsedEbook {
  ParsedEbook({required this.title, this.author, required this.chapters, Map<String, Uint8List>? images, this.coverHref})
      : images = images ?? {};
  final String title;
  final String? author;
  final List<EbookChapter> chapters;
  /// href (as referenced in chapter markdown) -> bytes; stored on import.
  final Map<String, Uint8List> images;
  final String? coverHref;
}

final _chapterHeading = RegExp(
    r'^\s*(第[一二三四五六七八九十百千万零〇两\d]+[章节回部卷集篇]|序章|序言|楔子|引子|尾声|后记|番外|Chapter\s+\d+|CHAPTER\s+\d+)');

class EbookService {
  EbookService._();
  static final EbookService instance = EbookService._();
  static const _uuid = Uuid();

  /// UTF-8 / UTF-16 BOM, else UTF-8; GBK-encoded TXT is detected and reported.
  String decodeBytes(Uint8List bytes) {
    if (bytes.length >= 3 && bytes[0] == 0xef && bytes[1] == 0xbb && bytes[2] == 0xbf) {
      return utf8.decode(bytes.sublist(3), allowMalformed: true);
    }
    if (bytes.length >= 2 && bytes[0] == 0xff && bytes[1] == 0xfe) {
      final codes = <int>[];
      for (var i = 2; i + 1 < bytes.length; i += 2) {
        codes.add(bytes[i] | (bytes[i + 1] << 8));
      }
      return String.fromCharCodes(codes);
    }
    if (bytes.length >= 2 && bytes[0] == 0xfe && bytes[1] == 0xff) {
      final codes = <int>[];
      for (var i = 2; i + 1 < bytes.length; i += 2) {
        codes.add((bytes[i] << 8) | bytes[i + 1]);
      }
      return String.fromCharCodes(codes);
    }
    final text = utf8.decode(bytes, allowMalformed: true);
    final bad = '\uFFFD'.allMatches(text).length;
    if (bad == 0) return text;
    // A few bad bytes in otherwise valid UTF-8 (truncated download, one stray
    // byte) must not flip the whole book to GBK mojibake.
    if (bad <= 4 || bad * 1000 < text.length) return text;
    // Same as the old app: fall back to GBK/GB18030 when it decodes cleaner.
    try {
      final g = const GbkCodec(allowMalformed: true).decode(bytes);
      final gBad = '\uFFFD'.allMatches(g).length;
      if (gBad < bad) return g;
    } catch (_) {}
    return text;
  }

  List<EbookChapter> splitPlainChapters(String text, {String fallbackTitle = '正文'}) {
    final lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
    final chapters = <EbookChapter>[];
    String? title;
    final buf = StringBuffer();
    void flush() {
      final body = buf.toString().trim();
      buf.clear();
      if (title == null && body.isEmpty) return;
      final t = title ?? fallbackTitle;
      chapters.add(EbookChapter(title: t, content: '# $t\n\n$body'));
    }

    for (final line in lines) {
      final trimmed = line.trim();
      if (trimmed.length <= 40 && _chapterHeading.hasMatch(trimmed)) {
        flush();
        title = trimmed;
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

  /// Split HTML by h1/h2 (or mbp:pagebreak) into markdown chapters.
  List<EbookChapter> splitHtmlChapters(String html, String fallbackTitle) {
    final body = RegExp(r'<body[^>]*>([\s\S]*)</body>', caseSensitive: false).firstMatch(html)?.group(1) ?? html;
    final parts = body.split(RegExp(r'(?=<h[12][\s>])|<mbp:pagebreak\s*/?>', caseSensitive: false));
    final out = <EbookChapter>[];
    var index = 1;
    for (final part in parts) {
      final md = htmlToMarkdown(part);
      if (md.replaceAll(RegExp(r'[#\s]'), '').isEmpty) continue;
      final h = RegExp(r'^#{1,6}\s+(.+)$', multiLine: true).firstMatch(md);
      final t = h?.group(1)?.trim() ?? '$fallbackTitle · $index';
      out.add(EbookChapter(title: t, content: h != null && md.startsWith('#') ? md : '# $t\n\n$md'));
      index++;
    }
    if (out.isEmpty) {
      out.add(EbookChapter(title: fallbackTitle, content: '# $fallbackTitle\n\n${htmlToMarkdown(body)}'));
    }
    return out;
  }

  String _stripName(String filename) => filename.replaceAll(RegExp(r'\.[^.]+$'), '');

  ParsedEbook parseTxt(Uint8List bytes, String filename) {
    final title = _stripName(filename);
    return ParsedEbook(title: title, chapters: splitPlainChapters(decodeBytes(bytes), fallbackTitle: title));
  }

  ParsedEbook parseHtml(Uint8List bytes, String filename) {
    final html = decodeBytes(bytes);
    final t = RegExp(r'<title[^>]*>([\s\S]*?)</title>', caseSensitive: false)
        .firstMatch(html)
        ?.group(1)
        ?.replaceAll(RegExp(r'<[^>]+>'), '')
        .trim();
    final title = t != null && t.isNotEmpty ? decodeEntities(t) : _stripName(filename);
    return ParsedEbook(title: title, chapters: splitHtmlChapters(html, title));
  }

  ParsedEbook parseFb2(Uint8List bytes, String filename) {
    var xml = decodeBytes(bytes);
    final title = RegExp(r'<book-title[^>]*>([\s\S]*?)</book-title>').firstMatch(xml)?.group(1)?.trim() ??
        _stripName(filename);
    final images = <String, Uint8List>{};
    for (final m in RegExp(r'<binary[^>]*id="([^"]+)"[^>]*>([\s\S]*?)</binary>').allMatches(xml)) {
      try {
        images[m[1]!] = base64Decode(m[2]!.replaceAll(RegExp(r'\s+'), ''));
      } catch (_) {}
    }
    xml = xml
        .replaceAll(RegExp(r'<binary[\s\S]*?</binary>'), '')
        .replaceAllMapped(RegExp(r'<section[^>]*>\s*<title[^>]*>([\s\S]*?)</title>'),
            (m) => '<h2>${m[1]!.replaceAll(RegExp(r'</?p[^>]*>'), ' ').trim()}</h2>')
        .replaceAllMapped(RegExp(r'''<image\b[^>]*(?:l:href|xlink:href)=["']#?([^"']+)["'][^>]*/?>'''),
            (m) => '<img src="${m[1]}">')
        .replaceAll(RegExp(r'<emphasis>'), '<em>')
        .replaceAll(RegExp(r'</emphasis>'), '</em>')
        .replaceAll(RegExp(r'<empty-line\s*/?>'), '<br/>');
    return ParsedEbook(title: title, chapters: splitHtmlChapters(xml, title), images: images);
  }

  ParsedEbook parseMobiBook(Uint8List bytes, String filename) {
    final book = parseMobi(bytes, filename);
    return ParsedEbook(
      title: book.title,
      author: book.author,
      chapters: splitHtmlChapters(book.html, book.title),
      images: book.images,
      coverHref: book.coverHref,
    );
  }

  ParsedEbook parseEpub(Uint8List bytes, String filename) {
    final archive = ZipDecoder().decodeBytes(bytes);
    String read(ArchiveFile f) => utf8.decode(f.content as List<int>, allowMalformed: true);
    ArchiveFile? find(String path) {
      final clean = path.split('#').first;
      return archive.findFile(clean) ?? archive.findFile(Uri.decodeFull(clean));
    }

    String? opfPath;
    final container = archive.findFile('META-INF/container.xml');
    if (container != null) {
      opfPath = RegExp(r'full-path="([^"]+)"').firstMatch(read(container))?.group(1);
    }
    opfPath ??= archive.files.map((f) => f.name).where((n) => n.endsWith('.opf')).firstOrNull;
    if (opfPath == null) throw Exception('无法解析 EPUB（缺少 OPF）');
    final opfFile = find(opfPath);
    if (opfFile == null) throw Exception('无法读取 EPUB 目录');
    final opf = read(opfFile);
    String meta(String tag) => decodeEntities(RegExp('<dc:$tag[^>]*>([\\s\\S]*?)</dc:$tag>', caseSensitive: false)
            .firstMatch(opf)
            ?.group(1)
            ?.replaceAll(RegExp(r'<[^>]+>'), '')
            .trim() ??
        '');
    final title = meta('title').isNotEmpty ? meta('title') : _stripName(filename);
    final author = meta('creator');
    final baseDir = opfPath.contains('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';

    final manifest = <String, ({String href, String type, String props})>{};
    for (final m in RegExp(r'<item\b[^>]*>', caseSensitive: false).allMatches(opf)) {
      final tag = m[0]!;
      String attr(String a) => RegExp('$a="([^"]*)"').firstMatch(tag)?.group(1) ?? '';
      final id = attr('id');
      if (id.isEmpty) continue;
      manifest[id] = (href: attr('href'), type: attr('media-type'), props: attr('properties'));
    }
    final spine = RegExp(r'<itemref[^>]+idref="([^"]+)"', caseSensitive: false).allMatches(opf).map((m) => m[1]!).toList();

    String resolve(String fromDir, String href) {
      final parts = '$fromDir$href'.split('#').first.split('/');
      final out = <String>[];
      for (final p in parts) {
        if (p == '..') {
          if (out.isNotEmpty) out.removeLast();
        } else if (p.isNotEmpty && p != '.') {
          out.add(p);
        }
      }
      return out.join('/');
    }

    final images = <String, Uint8List>{};
    final chapters = <EbookChapter>[];
    var index = 1;
    for (final id in spine) {
      final item = manifest[id];
      if (item == null) continue;
      if (!RegExp(r'x?html|xml', caseSensitive: false).hasMatch(item.type) &&
          !RegExp(r'\.(xhtml|html|htm)$', caseSensitive: false).hasMatch(item.href)) {
        continue;
      }
      final path = resolve(baseDir, item.href);
      final file = find(path);
      if (file == null) continue;
      final html = read(file);
      final dir = path.contains('/') ? path.substring(0, path.lastIndexOf('/') + 1) : '';
      final md = htmlToMarkdown(html, imageSrc: (src) {
        if (src.startsWith('data:') || src.startsWith('http')) return src;
        final full = resolve(dir, src);
        final img = find(full);
        if (img == null) return '';
        images[full] = Uint8List.fromList(img.content as List<int>);
        return 'epub-img:$full';
      });
      if (md.replaceAll(RegExp(r'[#\s]|!\[[^\]]*\]\([^)]*\)'), '').isEmpty && !md.contains('epub-img:')) {
        continue;
      }
      final h = RegExp(r'^#{1,6}\s+(.+)$', multiLine: true).firstMatch(md);
      final t = h?.group(1)?.trim() ?? '第 $index 章';
      chapters.add(EbookChapter(title: t, content: md.startsWith('#') ? md : '# $t\n\n$md'));
      index++;
    }
    if (chapters.isEmpty) throw Exception('EPUB 中没有可读章节');
    String? coverHref;
    final coverItem = manifest.values.where((v) => v.props.contains('cover-image')).firstOrNull;
    if (coverItem != null) {
      final full = resolve(baseDir, coverItem.href);
      final f = find(full);
      if (f != null) {
        images[full] = Uint8List.fromList(f.content as List<int>);
        coverHref = 'epub-img:$full';
      }
    }
    return ParsedEbook(title: title, author: author.isEmpty ? null : author, chapters: chapters, images: images, coverHref: coverHref);
  }

  static const supportedExtensions = ['txt', 'md', 'markdown', 'html', 'htm', 'epub', 'mobi', 'azw', 'azw3', 'prc', 'fb2'];

  ParsedEbook parse(Uint8List bytes, String filename) {
    final lower = filename.toLowerCase();
    if (lower.endsWith('.epub') || (bytes.length > 4 && bytes[0] == 0x50 && bytes[1] == 0x4b)) {
      return parseEpub(bytes, filename);
    }
    if (looksLikeMobi(bytes, filename)) return parseMobiBook(bytes, filename);
    if (lower.endsWith('.fb2')) return parseFb2(bytes, filename);
    if (lower.endsWith('.html') || lower.endsWith('.htm')) return parseHtml(bytes, filename);
    return parseTxt(bytes, filename);
  }

  Future<List<Note>> importAsNotes(ParsedEbook book) async {
    final bookId = _uuid.v4();
    // Store images and rewrite references to images/<id>.
    final stored = <String, String>{};
    for (final e in book.images.entries) {
      final name = e.key.split('/').last;
      final img = await ImageStore.instance.saveBytes(e.value, name.contains('.') ? name : '$name.jpg');
      stored[e.key] = img.path;
    }
    String rewrite(String md) => md.replaceAllMapped(RegExp(r'\]\((epub-img:)?([^)\s]+)\)'), (m) {
          final key = m[2]!;
          final hit = stored[key];
          return hit != null ? ']($hit)' : (m[1] != null ? ']()' : m[0]!);
        });
    final cover = book.coverHref == null ? null : stored[book.coverHref!.replaceFirst('epub-img:', '')];
    final folder = '电子书/${book.title.replaceAll('/', '_')}';
    final created = <Note>[];
    for (var i = 0; i < book.chapters.length; i++) {
      final chap = book.chapters[i];
      final base = await NoteStore.instance.create(content: rewrite(chap.content), folder: folder);
      final note = base.copyWith(
        bookId: bookId,
        bookTitle: book.title,
        bookAuthor: book.author,
        bookCover: cover,
        chapterIndex: i,
      );
      await NoteStore.instance.update(note);
      created.add(note);
    }
    return created;
  }
}
