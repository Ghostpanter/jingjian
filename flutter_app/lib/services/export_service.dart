import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:archive/archive.dart';
import 'package:flutter/foundation.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:path/path.dart' as p;

import 'storage/blob_store.dart';
import 'package:path_provider/path_provider.dart';
import 'package:pdf/pdf.dart';
import 'package:printing/printing.dart';
import 'package:share_plus/share_plus.dart';
import 'package:uuid/uuid.dart';

import '../models/note.dart';
import 'image_store.dart';
import 'note_file.dart';

enum ExportFormat { markdown, plainText, html, rtf, pdf, epub }

const exportFormatLabels = {
  ExportFormat.markdown: 'Markdown (.md)',
  ExportFormat.plainText: '纯文本 (.txt)',
  ExportFormat.html: '网页 (.html)',
  ExportFormat.rtf: 'Word / RTF (.rtf)',
  ExportFormat.pdf: 'PDF (.pdf)',
  ExportFormat.epub: '电子书 EPUB (.epub)',
};

String escapeHtml(String s) =>
    s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

String safeFileName(String title) {
  var cleaned = title.replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_').trim();
  final runes = cleaned.runes.toList();
  if (runes.length > 60) cleaned = String.fromCharCodes(runes.take(60)); // never split an emoji
  cleaned = cleaned.replaceAll(RegExp(r'[. ]+$'), ''); // Windows forbids trailing dot/space
  if (RegExp(r'^(con|prn|aux|nul|com\d|lpt\d)$', caseSensitive: false).hasMatch(cleaned)) cleaned = '_$cleaned';
  return cleaned.isEmpty ? '未命名笔记' : cleaned;
}

const _css = '''
body{font-family:"Noto Serif SC","Source Han Serif SC","Songti SC",serif;max-width:760px;margin:2rem auto;padding:0 1.2rem;line-height:1.75;color:#1a1814;background:#fff}
h1,h2,h3{line-height:1.35} pre,code{font-family:ui-monospace,Menlo,Consolas,monospace;background:#f2ede4;border-radius:6px}
code{padding:.1em .3em} pre{padding:12px;overflow:auto;white-space:pre-wrap} pre code{padding:0;background:none}
blockquote{border-left:3px solid #5b6c4d;margin:1em 0;padding-left:12px;color:#5a544c}
img{max-width:100%} table{border-collapse:collapse} th,td{border:1px solid #d4cbbc;padding:4px 8px}
.page-break{page-break-after:always}
''';

class ExportService {
  ExportService._();
  static final ExportService instance = ExportService._();
  static const _uuid = Uuid();

  String toPlainText(String content) => content
      .replaceAll(RegExp(r'^---\n[\s\S]*?\n---\n', multiLine: false), '')
      .replaceAll(RegExp(r'^#{1,6}\s+', multiLine: true), '')
      .replaceAll(RegExp(r'!\[[^\]]*\]\([^)]*\)'), '')
      .replaceAllMapped(RegExp(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'), (m) => m[2] ?? m[1]!)
      .replaceAllMapped(RegExp(r'\[([^\]]+)\]\([^)]*\)'), (m) => m[1]!)
      .replaceAll(RegExp(r'(\*\*|__|~~|`)'), '')
      .replaceAll(RegExp(r'^>\s?', multiLine: true), '')
      .replaceAll(RegExp(r'^\s*[-*+]\s+\[[ xX]\]\s+', multiLine: true), '• ')
      .replaceAll(RegExp(r'^\s*[-*+]\s+', multiLine: true), '• ')
      .trim();

  /// Body HTML; local `images/<id>` become data URIs (or relative paths for EPUB).
  Future<String> bodyHtml(String content, {Map<String, ImageBlob>? epubImages}) async {
    var source = content.replaceFirst(RegExp(r'^---\n[\s\S]*?\n---\n'), '');
    source = source.replaceAllMapped(RegExp(r'\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]'),
        (m) => '**${m[2] ?? m[1]}**');
    var html = md.markdownToHtml(source, extensionSet: md.ExtensionSet.gitHubFlavored);
    final ids = imageIdsIn(html);
    for (final id in ids) {
      final img = ImageStore.instance.imageSync(id);
      if (img == null) continue;
      String replacement;
      if (epubImages != null) {
        final name = 'images/${img.name}';
        epubImages[name] = img;
        replacement = name;
      } else {
        replacement = 'data:${img.mime};base64,${base64Encode(img.bytes)}';
      }
      html = html.replaceAll(RegExp('src="(?:\\./)?images/$id(?:\\.[a-z0-9]+)?"', caseSensitive: false), 'src="$replacement"');
    }
    return html;
  }

  Future<String> toHtmlDocument(List<Note> notes, {String? title}) async {
    final docTitle = escapeHtml(title ?? (notes.length == 1 ? notes.first.title : '静笺导出'));
    final buf = StringBuffer();
    for (var i = 0; i < notes.length; i++) {
      if (i > 0) buf.write('<div class="page-break"></div>');
      buf.write(notes[i].format == NoteFormat.txt
          ? '<pre>${escapeHtml(notes[i].content)}</pre>'
          : await bodyHtml(notes[i].content));
    }
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        '<title>$docTitle</title><style>$_css</style></head><body>$buf</body></html>';
  }

  String toRtf(Note note) {
    final buf = StringBuffer(r'{\rtf1\ansi\deff0\uc1{\fonttbl{\f0\fnil\fcharset134 Noto Serif SC;}}\f0\fs24 ');
    for (final line in toPlainText(note.content).split('\n')) {
      buf.write(r'\pard ');
      for (final rune in line.runes) {
        if (rune == 0x5C) {
          buf.write(r'\\');
        } else if (rune == 0x7B) {
          buf.write(r'\{');
        } else if (rune == 0x7D) {
          buf.write(r'\}');
        } else if (rune < 128) {
          buf.writeCharCode(rune);
        } else if (rune > 0xFFFF) {
          final v = rune - 0x10000;
          for (final u in [0xD800 + (v >> 10), 0xDC00 + (v & 0x3FF)]) {
            buf.write('\\u${u - 65536}?');
          }
        } else {
          buf.write('\\u${rune > 32767 ? rune - 65536 : rune}?');
        }
      }
      buf.write(r'\par ');
    }
    buf.write('}');
    return buf.toString();
  }

  /// PDF via the platform HTML renderer (Android/iOS/macOS). Throws on
  /// platforms where printing cannot convert HTML (Linux/Windows/Web).
  Future<Uint8List> toPdf(List<Note> notes, {String? title}) async {
    final html = await toHtmlDocument(notes, title: title);
    return Printing.convertHtml(html: html, format: PdfPageFormat.a4);
  }

  bool get pdfSupported =>
      !kIsWeb && (Platform.isAndroid || Platform.isIOS || Platform.isMacOS);

  Future<void> printNotes(List<Note> notes, {String? title}) async {
    final name = title ?? (notes.length == 1 ? notes.first.title : '静笺');
    if (pdfSupported) {
      await Printing.layoutPdf(name: name, onLayout: (_) => toPdf(notes, title: title));
    } else {
      throw Exception('此平台不支持直接打印，请导出 HTML 后用浏览器打印');
    }
  }

  /// EPUB 3 (with NCX fallback). Each note becomes one chapter.
  Future<Uint8List> toEpub(List<Note> notes, {required String title, String? author}) async {
    final archive = Archive();
    void add(String name, List<int> data, {bool store = false}) {
      final f = ArchiveFile(name, data.length, data);
      if (store) f.compression = CompressionType.none;
      archive.addFile(f);
    }

    add('mimetype', utf8.encode('application/epub+zip'), store: true);
    add('META-INF/container.xml', utf8.encode('<?xml version="1.0" encoding="UTF-8"?>'
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">'
        '<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'));
    final images = <String, ImageBlob>{};
    final manifest = StringBuffer();
    final spine = StringBuffer();
    final navItems = StringBuffer();
    final ncx = StringBuffer();
    for (var i = 0; i < notes.length; i++) {
      final n = notes[i];
      final id = 'c${i + 1}';
      final body = n.format == NoteFormat.txt
          ? '<pre>${escapeHtml(n.content)}</pre>'
          : await bodyHtml(n.content, epubImages: images);
      final xhtml = '<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html>'
          '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-CN"><head><meta charset="utf-8"/>'
          '<title>${escapeHtml(n.title)}</title><link rel="stylesheet" href="style.css"/></head>'
          '<body>${_xhtmlSafe(body)}</body></html>';
      add('OEBPS/$id.xhtml', utf8.encode(xhtml));
      manifest.write('<item id="$id" href="$id.xhtml" media-type="application/xhtml+xml"/>');
      spine.write('<itemref idref="$id"/>');
      navItems.write('<li><a href="$id.xhtml">${escapeHtml(n.title)}</a></li>');
      ncx.write('<navPoint id="n$id" playOrder="${i + 1}"><navLabel><text>${escapeHtml(n.title)}</text></navLabel><content src="$id.xhtml"/></navPoint>');
    }
    var imgIndex = 0;
    for (final e in images.entries) {
      add('OEBPS/${e.key}', e.value.bytes);
      manifest.write('<item id="img${imgIndex++}" href="${e.key}" media-type="${e.value.mime}"/>');
    }
    add('OEBPS/style.css', utf8.encode(_css));
    add('OEBPS/nav.xhtml', utf8.encode('<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE html>'
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>目录</title></head>'
        '<body><nav epub:type="toc"><h1>目录</h1><ol>$navItems</ol></nav></body></html>'));
    final uid = 'urn:uuid:${_uuid.v4()}';
    add('OEBPS/toc.ncx', utf8.encode('<?xml version="1.0" encoding="UTF-8"?>'
        '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="$uid"/></head>'
        '<docTitle><text>${escapeHtml(title)}</text></docTitle><navMap>$ncx</navMap></ncx>'));
    final modified = DateTime.now().toUtc().toIso8601String().split('.').first;
    add('OEBPS/content.opf', utf8.encode('<?xml version="1.0" encoding="UTF-8"?>'
        '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="zh-CN">'
        '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="bookid">$uid</dc:identifier>'
        '<dc:title>${escapeHtml(title)}</dc:title><dc:language>zh-CN</dc:language>'
        '${author != null && author.isNotEmpty ? '<dc:creator>${escapeHtml(author)}</dc:creator>' : ''}'
        '<meta property="dcterms:modified">${modified}Z</meta></metadata>'
        '<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
        '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
        '<item id="css" href="style.css" media-type="text/css"/>$manifest</manifest>'
        '<spine toc="ncx">$spine</spine></package>'));
    return Uint8List.fromList(ZipEncoder().encode(archive));
  }

  String _xhtmlSafe(String html) => html
      .replaceAllMapped(RegExp(r'<(br|hr|img|input)([^>]*?)\s*/?>', caseSensitive: false), (m) => '<${m[1]}${m[2]}/>')
      .replaceAll('&nbsp;', '&#160;');

  /// All (or given) notes as a .zip of front-matter Markdown files in folders,
  /// plus the images they use — the old app's 导出文件夹.
  Future<Uint8List> toZip(List<Note> notes) async {
    final archive = Archive();
    final usedNames = <String>{};
    final imageIds = <String>{};
    for (final n in notes.where((n) => !n.isTrashed)) {
      final dir = (n.folder ?? '').isEmpty ? '' : '${n.folder}/';
      var name = '$dir${filenameForNote(n)}';
      while (!usedNames.add(name)) {
        name = name.replaceFirst(RegExp(r'(\.\w+)$'), '_1\$1');
      }
      final data = utf8.encode(serializeNote(n));
      archive.addFile(ArchiveFile(name, data.length, data));
      imageIds.addAll(imageIdsIn(n.content));
    }
    for (final id in imageIds) {
      final img = ImageStore.instance.imageSync(id);
      if (img == null) continue;
      archive.addFile(ArchiveFile('images/${img.name}', img.bytes.length, img.bytes));
    }
    return Uint8List.fromList(ZipEncoder().encode(archive));
  }

  Future<({Uint8List bytes, String name, String mime})> render(
    List<Note> notes,
    ExportFormat format, {
    String? title,
  }) async {
    final t = title ?? (notes.length == 1 ? notes.first.title : '静笺导出');
    final base = safeFileName(t);
    switch (format) {
      case ExportFormat.markdown:
        if (notes.length > 1) return (bytes: await toZip(notes), name: '$base.zip', mime: 'application/zip');
        return (bytes: Uint8List.fromList(utf8.encode(notes.first.content)), name: '$base.md', mime: 'text/markdown');
      case ExportFormat.plainText:
        return (
          bytes: Uint8List.fromList(utf8.encode(notes.map((n) => toPlainText(n.content)).join('\n\n\f\n\n'))),
          name: '$base.txt',
          mime: 'text/plain'
        );
      case ExportFormat.html:
        return (bytes: Uint8List.fromList(utf8.encode(await toHtmlDocument(notes, title: t))), name: '$base.html', mime: 'text/html');
      case ExportFormat.rtf:
        return (bytes: Uint8List.fromList(utf8.encode(notes.map(toRtf).join('\n'))), name: '$base.rtf', mime: 'application/rtf');
      case ExportFormat.pdf:
        if (!pdfSupported) throw Exception('此平台无法直接生成 PDF，请导出 HTML 后用浏览器“打印为 PDF”');
        return (bytes: await toPdf(notes, title: t), name: '$base.pdf', mime: 'application/pdf');
      case ExportFormat.epub:
        final author = notes.map((n) => n.bookAuthor).whereType<String>().firstOrNull;
        return (bytes: await toEpub(notes, title: t, author: author), name: '$base.epub', mime: 'application/epub+zip');
    }
  }

  /// Share on mobile; on desktop write to Documents/jingjian/exports and return the path.
  Future<String?> deliver(Uint8List bytes, String name, String mime) async {
    if (!kIsWeb && (Platform.isAndroid || Platform.isIOS)) {
      final dir = await getTemporaryDirectory();
      final file = File(p.join(dir.path, name));
      await file.writeAsBytes(bytes, flush: true);
      await SharePlus.instance.share(ShareParams(files: [XFile(file.path, mimeType: mime)], subject: name));
      return null;
    }
    if (kIsWeb) {
      await SharePlus.instance.share(ShareParams(files: [XFile.fromData(bytes, name: name, mimeType: mime)]));
      return null;
    }
    final docsPath = await appDataRoot();
    final dir = Directory(p.join(docsPath, 'jingjian', 'exports'));
    await dir.create(recursive: true);
    // Don't overwrite an earlier export with the same title.
    var file = File(p.join(dir.path, name));
    final stem = p.basenameWithoutExtension(name), ext = p.extension(name);
    for (var i = 2; await file.exists(); i++) {
      file = File(p.join(dir.path, '$stem ($i)$ext'));
    }
    await file.writeAsBytes(bytes, flush: true);
    return file.path;
  }

  Future<String?> export(List<Note> notes, ExportFormat format, {String? title}) async {
    final out = await render(notes, format, title: title);
    return deliver(out.bytes, out.name, out.mime);
  }
}

