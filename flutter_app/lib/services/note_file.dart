import '../models/note.dart';

final _frontmatter = RegExp(r'^---\r?\n([\s\S]*?)\r?\n---\r?\n?');

String firstLineTitle(String content) {
  for (final raw in content.split('\n')) {
    final line = raw.trim();
    if (line.isEmpty) continue;
    return line.replaceFirst(RegExp(r'^#{1,6}\s+'), '').trim();
  }
  return '未命名笔记';
}

String filenameForNote(Note note) {
  final stem = firstLineTitle(note.content)
      .replaceAll(RegExp(r'[\\/:*?"<>|\x00-\x1f]'), '_')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();
  final short = note.id.replaceAll('-', '');
  final id8 = short.length >= 8 ? short.substring(0, 8) : short;
  final ext = note.format == NoteFormat.txt ? 'txt' : 'md';
  final name = stem.isEmpty ? '未命名笔记' : (stem.length > 42 ? stem.substring(0, 42) : stem);
  return '$name.$id8.$ext';
}

String _unquote(String value) {
  if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
    try {
      // JSON string
      return value.substring(1, value.length - 1).replaceAll(r'\"', '"').replaceAll(r'\\', r'\');
    } catch (_) {
      return value.substring(1, value.length - 1);
    }
  }
  return value;
}

String serializeNote(Note note) {
  final buf = StringBuffer('---\nid: ${note.id}\ncreatedAt: ${note.createdAt}\nupdatedAt: ${note.updatedAt}');
  if (note.format == NoteFormat.txt) buf.write('\nformat: txt');
  if (note.bookId != null) {
    buf.write('\nbookId: ${note.bookId}');
    buf.write('\nbookTitle: ${jsonQuote(note.bookTitle ?? '')}');
    buf.write('\nchapterIndex: ${note.chapterIndex ?? 0}');
    if (note.bookAuthor != null) buf.write('\nbookAuthor: ${jsonQuote(note.bookAuthor!)}');
    if (note.bookCover != null) buf.write('\nbookCover: ${jsonQuote(note.bookCover!)}');
  }
  if (note.readAt != null) {
    buf.write('\nreadAt: ${note.readAt}');
    buf.write('\nreadRatio: ${note.readRatio ?? 0}');
  }
  if (note.openedAt != null) buf.write('\nopenedAt: ${note.openedAt}');
  if (note.starredAt != null) {
    buf.write('\nstarred: ${note.starred ? 'true' : 'false'}');
    buf.write('\nstarredAt: ${note.starredAt}');
  }
  if (note.trashedAt != null) buf.write('\ntrashedAt: ${note.trashedAt}');
  if (note.restoredAt != null) buf.write('\nrestoredAt: ${note.restoredAt}');
  if (note.folder != null && note.folder!.isNotEmpty) {
    buf.write('\nfolder: ${jsonQuote(note.folder!)}');
  }
  buf.write('\n---\n');
  buf.write(note.content);
  return buf.toString();
}

String jsonQuote(String value) => '"${value.replaceAll(r'\', r'\\').replaceAll('"', r'\"')}"';

Note parseNoteFile(String raw, String fallbackId) {
  final text = raw.replaceFirst(RegExp(r'^\uFEFF'), '');
  final now = DateTime.now().millisecondsSinceEpoch;
  final match = text.startsWith('---') ? _frontmatter.firstMatch(text) : null;
  if (match == null) {
    return Note(id: fallbackId, content: text, createdAt: now, updatedAt: now);
  }
  final meta = <String, String>{};
  for (final line in match.group(1)!.split('\n')) {
    final idx = line.indexOf(':');
    if (idx <= 0) continue;
    meta[line.substring(0, idx).trim()] = line.substring(idx + 1).trim();
  }
  final body = text.substring(match.end);
  return Note(
    id: meta['id']?.isNotEmpty == true ? meta['id']! : fallbackId,
    content: body,
    createdAt: int.tryParse(meta['createdAt'] ?? '') ?? now,
    updatedAt: int.tryParse(meta['updatedAt'] ?? '') ?? now,
    format: meta['format'] == 'txt' ? NoteFormat.txt : NoteFormat.markdown,
    folder: meta['folder'] != null ? _unquote(meta['folder']!) : null,
    bookId: meta['bookId'],
    bookTitle: meta['bookTitle'] != null ? _unquote(meta['bookTitle']!) : null,
    bookAuthor: meta['bookAuthor'] != null ? _unquote(meta['bookAuthor']!) : null,
    bookCover: meta['bookCover'] != null ? _unquote(meta['bookCover']!) : null,
    chapterIndex: int.tryParse(meta['chapterIndex'] ?? ''),
    readAt: int.tryParse(meta['readAt'] ?? ''),
    readRatio: double.tryParse(meta['readRatio'] ?? ''),
    openedAt: int.tryParse(meta['openedAt'] ?? ''),
    starred: meta['starred'] == 'true',
    starredAt: int.tryParse(meta['starredAt'] ?? ''),
    trashedAt: int.tryParse(meta['trashedAt'] ?? ''),
    restoredAt: int.tryParse(meta['restoredAt'] ?? ''),
  );
}
