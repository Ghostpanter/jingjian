import 'dart:convert';
import 'dart:typed_data';

import '../../models/note.dart';
import '../image_store.dart';
import '../note_file.dart';

/// Same wire format as the old app (markdown-file.ts / sync-images.ts):
/// note text, then
///   \n%%JINGJIAN-IMAGES%%\n`<id> <mime> <base64>`\n...%%END-JINGJIAN-IMAGES%%\n
const _start = '\n%%JINGJIAN-IMAGES%%\n';
const _end = '%%END-JINGJIAN-IMAGES%%';
const maxSyncImageBytes = 1800000;

class SyncedImage {
  SyncedImage(this.id, this.mime, this.base64);
  final String id;
  final String mime;
  final String base64;
}

({String content, List<SyncedImage> images}) splitImageTrailer(String text) {
  final start = text.lastIndexOf(_start);
  if (start < 0) return (content: text, images: <SyncedImage>[]);
  final end = text.indexOf(_end, start + _start.length);
  if (end < 0) return (content: text, images: <SyncedImage>[]);
  final images = <SyncedImage>[];
  for (final raw in text.substring(start + _start.length, end).split('\n')) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    final first = line.indexOf(' ');
    final second = first < 0 ? -1 : line.indexOf(' ', first + 1);
    if (first <= 0 || second < 0) continue;
    final id = line.substring(0, first);
    final mime = line.substring(first + 1, second);
    final b64 = line.substring(second + 1).trim();
    if (!RegExp(r'^[a-z0-9-]+$', caseSensitive: false).hasMatch(id) || b64.isEmpty) continue;
    images.add(SyncedImage(id, mime, b64));
  }
  return (content: text.substring(0, start), images: images);
}

Future<String> serializeNoteWithImages(Note note) async {
  final text = serializeNote(note);
  final ids = imageIdsIn(note.content);
  if (ids.isEmpty) return text;
  final lines = <String>[];
  for (final id in ids) {
    final file = ImageStore.instance.fileForIdSync(id);
    if (file == null) continue;
    final bytes = await file.readAsBytes();
    if (bytes.length > maxSyncImageBytes) continue;
    final mime = sniffImageMime(bytes) ?? mimeForName(file.path);
    lines.add('$id $mime ${base64Encode(bytes)}');
  }
  if (lines.isEmpty) return text;
  return '$text$_start${lines.join('\n')}\n$_end\n';
}

/// Parse a synced note file and store any embedded images that are missing locally.
Future<Note> parseSyncedNote(String raw, String fallbackId) async {
  final split = splitImageTrailer(raw);
  final note = parseNoteFile(split.content, fallbackId);
  for (final img in split.images) {
    if (await ImageStore.instance.hasId(img.id)) continue;
    try {
      final bytes = Uint8List.fromList(base64Decode(img.base64));
      final ext = switch (img.mime) {
        'image/png' => '.png',
        'image/gif' => '.gif',
        'image/webp' => '.webp',
        'image/svg+xml' => '.svg',
        _ => '.jpg',
      };
      await ImageStore.instance.saveBytes(bytes, 'x$ext', id: img.id);
    } catch (_) {
      // bad base64: skip, the note text is still usable
    }
  }
  return note;
}

String decodeUtf8Body(List<int> bytes) =>
    utf8.decode(bytes, allowMalformed: true).replaceFirst('\uFEFF', '');
