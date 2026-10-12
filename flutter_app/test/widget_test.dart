import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/folder_tree.dart';
import 'package:jingjian/services/link_graph.dart';
import 'package:jingjian/services/note_file.dart';
import 'package:jingjian/services/sync/sync_merge.dart';
import 'package:jingjian/models/note.dart';

void main() {
  test('folder normalize', () {
    expect(normalizeFolder(r'手册\写作/../草稿'), '手册/草稿');
  });

  test('parse serialize note', () {
    final note = Note(
      id: 'abc',
      content: '# Hello\n\n[[World]]',
      createdAt: 1,
      updatedAt: 2,
      folder: '手册',
    );
    final raw = serializeNote(note);
    final parsed = parseNoteFile(raw, 'fallback');
    expect(parsed.id, 'abc');
    expect(parsed.folder, '手册');
    expect(parsed.content.contains('Hello'), true);
  });

  test('link graph wiki', () {
    final notes = [
      (id: 'a', content: '# Alpha\n\nSee [[Beta]]'),
      (id: 'b', content: '# Beta\n\nBack'),
    ];
    final g = linkGraph(notes);
    expect(g.links.length, 1);
    expect(g.nodes.length, greaterThanOrEqualTo(2));
  });

  test('merge uploads when local extends remote', () {
    final local = [
      Note(id: '1', content: 'Hello world', createdAt: 1, updatedAt: 10),
    ];
    final remote = [
      Note(id: '1', content: 'Hello', createdAt: 1, updatedAt: 5),
    ];
    final merged = mergeNotes(MergeInput(local: local, remote: remote, tombstones: {}));
    expect(merged.notes.first.content, 'Hello world');
    expect(merged.toUpload.length, 1);
  });
}
