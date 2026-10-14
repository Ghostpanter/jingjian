import 'dart:convert';

import 'package:crypto/crypto.dart';

import '../models/note.dart';
import 'note_store.dart';

const ebookRoot = '电子书';

/// One imported book: title from the book's metadata/TOC (bookTitle), chapters
/// in TOC order (chapterIndex).
class BookEntry {
  BookEntry(this.id, this.title, this.author, this.chapters);
  final String id;
  final String title;
  final String? author;
  final List<Note> chapters;
}

String _folderTitle(String? folder) {
  if (folder == null || !folder.startsWith('$ebookRoot/')) return '';
  return folder.substring(ebookRoot.length + 1).split('/').first.trim();
}

/// Books on the shelf, grouped by bookId, sorted by title.
List<BookEntry> bookshelf(List<Note> notes) {
  final groups = <String, List<Note>>{};
  for (final n in notes) {
    if (n.isTrashed || n.bookId == null || n.bookId!.isEmpty) continue;
    groups.putIfAbsent(n.bookId!, () => []).add(n);
  }
  final books = <BookEntry>[];
  groups.forEach((id, chapters) {
    chapters.sort((a, b) {
      final c = (a.chapterIndex ?? 1 << 30).compareTo(b.chapterIndex ?? 1 << 30);
      return c != 0 ? c : a.createdAt.compareTo(b.createdAt);
    });
    final counts = <String, int>{};
    for (final c in chapters) {
      final t = (c.bookTitle ?? '').trim();
      if (t.isNotEmpty) counts[t] = (counts[t] ?? 0) + 1;
    }
    var title = counts.isEmpty ? '' : (counts.entries.toList()..sort((a, b) => b.value.compareTo(a.value))).first.key;
    if (title.isEmpty) title = _folderTitle(chapters.first.folder);
    if (title.isEmpty) title = chapters.first.title;
    final author = chapters.map((c) => c.bookAuthor).firstWhere((a) => a != null && a.trim().isNotEmpty, orElse: () => null);
    books.add(BookEntry(id, title, author, chapters));
  });
  books.sort((a, b) => a.title.compareTo(b.title));
  return books;
}

/// Chapter notes of [bookId] in TOC order.
List<Note> bookChapters(List<Note> notes, String bookId) =>
    bookshelf(notes).where((b) => b.id == bookId).map((b) => b.chapters).firstOrNull ?? const [];

/// Folder paths under 电子书/ whose notes are all book chapters (shown on the
/// shelf instead of in the folder tree).
bool isPureBookFolder(String path, List<Note> notes) {
  if (path != ebookRoot && !path.startsWith('$ebookRoot/')) return false;
  var any = false;
  for (final n in notes) {
    if (n.isTrashed) continue;
    final f = n.folder ?? '';
    if (f == path || f.startsWith('$path/')) {
      if (n.bookId == null) return false;
      any = true;
    }
  }
  return any;
}

/// Older imports / synced copies that sit in 电子书/<书名> but lost their book
/// fields: give them a stable bookId, the folder name as title, and import
/// order as chapter order. Only metadata changes; text is untouched.
Future<int> migrateLegacyBookFolders(NoteStore store) async {
  final groups = <String, List<Note>>{};
  for (final n in store.allNotes) {
    if (n.bookId != null) continue;
    final t = _folderTitle(n.folder);
    if (t.isEmpty) continue;
    groups.putIfAbsent(n.folder!, () => []).add(n);
  }
  var changed = 0;
  for (final e in groups.entries) {
    final id = 'legacy-${sha1.convert(utf8.encode(e.key)).toString().substring(0, 16)}';
    final list = e.value..sort((a, b) {
      final c = a.createdAt.compareTo(b.createdAt);
      return c != 0 ? c : a.id.compareTo(b.id);
    });
    for (var i = 0; i < list.length; i++) {
      final n = list[i];
      await store.insert(n.copyWith(bookId: id, bookTitle: _folderTitle(n.folder), chapterIndex: n.chapterIndex ?? i));
      changed++;
    }
  }
  return changed;
}
