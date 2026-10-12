import 'dart:convert';
import 'dart:io';

import 'package:path/path.dart' as p;
import 'package:path_provider/path_provider.dart';
import 'package:share_plus/share_plus.dart';
import 'package:markdown/markdown.dart' as md;

import '../models/note.dart';
import 'note_file.dart';

enum ExportFormat { markdown, plainText, html, rtf }

class ExportService {
  ExportService._();
  static final ExportService instance = ExportService._();

  String _escapeHtml(String s) => s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');

  String toPlainText(String content) {
    return content
        .replaceAll(RegExp(r'^#{1,6}\s+', multiLine: true), '')
        .replaceAll(RegExp(r'[*_`~]'), '')
        .replaceAll(RegExp(r'!\[[^\]]*\]\([^)]*\)'), '')
        .replaceAllMapped(RegExp(r'\[([^\]]+)\]\([^)]*\)'), (m) => m.group(1)!)
        .replaceAll(RegExp(r'^>\s?', multiLine: true), '')
        .replaceAll(RegExp(r'^[-*+]\s+', multiLine: true), '• ')
        .trim();
  }

  String toHtmlDocument(Note note, {bool styled = true}) {
    final body = md.markdownToHtml(
      note.content,
      extensionSet: md.ExtensionSet.gitHubFlavored,
    );
    final title = _escapeHtml(note.title);
    if (!styled) {
      return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>$title</title></head><body>$body</body></html>';
    }
    return '''<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$title</title>
<style>
body{font-family:system-ui,sans-serif;max-width:720px;margin:2rem auto;padding:0 1rem;line-height:1.65;color:#2c2825;background:#f2ede4}
pre,code{background:#e8e2d6;border-radius:6px} pre{padding:12px;overflow:auto}
blockquote{border-left:3px solid #5b6c4d;margin:0;padding-left:12px;color:#7a7268}
img{max-width:100%}
</style></head><body>$body</body></html>''';
  }

  String toRtf(Note note) {
    final plain = toPlainText(note.content);
    final buf = StringBuffer(r'{\rtf1\ansi\deff0\uc1{\fonttbl{\f0\fnil\fcharset134 Noto Serif SC;}}\f0\fs24');
    for (final line in plain.split('\n')) {
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
        } else {
          final u = rune > 32767 ? rune - 65536 : rune;
          buf.write('\\u$u?');
        }
      }
      buf.write(r'\par');
    }
    buf.write('}');
    return buf.toString();
  }

  Future<File> writeTemp(Note note, ExportFormat format) async {
    final dir = await getTemporaryDirectory();
    String name;
    String data;
    switch (format) {
      case ExportFormat.markdown:
        name = '${_safe(note.title)}.md';
        data = serializeNote(note);
      case ExportFormat.plainText:
        name = '${_safe(note.title)}.txt';
        data = toPlainText(note.content);
      case ExportFormat.html:
        name = '${_safe(note.title)}.html';
        data = toHtmlDocument(note);
      case ExportFormat.rtf:
        name = '${_safe(note.title)}.rtf';
        data = toRtf(note);
    }
    final file = File(p.join(dir.path, name));
    await file.writeAsString(data, encoding: utf8);
    return file;
  }

  Future<void> shareNote(Note note, ExportFormat format) async {
    final file = await writeTemp(note, format);
    await SharePlus.instance.share(ShareParams(files: [XFile(file.path)], subject: note.title));
  }

  Future<Directory> exportAllZip(List<Note> notes) async {
    // Simple concatenated folder export as individual files in temp.
    final dir = await getTemporaryDirectory();
    final out = Directory(p.join(dir.path, 'jingjian-export-${DateTime.now().millisecondsSinceEpoch}'));
    await out.create(recursive: true);
    for (final note in notes.where((n) => !n.isTrashed)) {
      final file = File(p.join(out.path, filenameForNote(note)));
      await file.writeAsString(serializeNote(note));
    }
    return out;
  }

  String _safe(String title) {
    final cleaned = title.replaceAll(RegExp(r'[\\/:*?"<>|]'), '_').trim();
    if (cleaned.isEmpty) return '未命名笔记';
    return cleaned.length > 40 ? cleaned.substring(0, 40) : cleaned;
  }
}
