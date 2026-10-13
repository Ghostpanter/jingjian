import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/app_prefs.dart';
import 'package:jingjian/services/backlinks.dart';
import 'package:jingjian/services/image_store.dart';
import 'package:jingjian/services/legacy_migration.dart';
import 'package:jingjian/services/note_history.dart';
import 'package:jingjian/services/note_store.dart';
import 'package:jingjian/services/note_text.dart';
import 'package:jingjian/services/search_index.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late Directory root;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AppPrefs.instance.init();
    root = await Directory.systemTemp.createTemp('jjmig');
    await ImageStore.instance.init(root: root.path);
    await NoteHistory.instance.init(root: root.path);
    await NoteStore.instance.init(root: root.path); // fresh install → welcome note
  });
  tearDown(() => root.delete(recursive: true));

  test('1.7.x Capacitor localStorage payload imports and works with 1.8.4 features', () async {
    final big = '# 大笔记\n${List.filled(4000, '很长的一行 #长文').join('\n')}';
    // Shape written by src/lib/notes/store.ts writePersisted() and trash.ts.
    final notesPayload = jsonEncode({
      'notes': [
        {'id': 'a1', 'content': '# 服务端协作\n见 [[读书]]\n#工作', 'createdAt': 1700000000000, 'updatedAt': 1700000500000, 'folder': '项目'},
        {'id': 'b2', 'content': '# 读书\n- [ ] 第一章', 'createdAt': 1700000000000, 'updatedAt': 1700000000000,
          'bookId': 'bk', 'bookTitle': '书', 'chapterIndex': 2, 'readRatio': 0.5, 'starred': true},
        {'id': 'c3', 'content': big.substring(0, 300), 'overflow': true, 'createdAt': 1, 'updatedAt': 2},
        {'id': 'd4', 'content': 'plain text', 'format': 'txt', 'createdAt': 1, 'updatedAt': 1},
        {'id': '', 'content': 'bad'},
        {'content': 'no id'},
      ],
      'activeId': 'a1',
      'previewMode': 'split',
      'folders': ['项目', '空文件夹'],
    });
    final trash = jsonEncode([
      {'id': 't9', 'content': '# 已删除', 'createdAt': 1, 'updatedAt': 1, 'deletedAt': 1700000900000},
    ]);
    final prefs = await SharedPreferences.getInstance();
    final n = await LegacyMigration.importLegacy({
      'ls': {
        'jingjian.notes.v1': notesPayload,
        'jingjian.trash.v1': trash,
        'jingjian.sync.v1': '{"url":"https://x"}',
      },
      'overflow': {'c3': big},
    }, prefs: prefs);
    expect(n, 5);
    final st = NoteStore.instance;
    expect(st.allNotes.any((x) => x.content.startsWith('# 欢迎使用静笺')), isFalse); // pristine welcome removed
    expect(st.allNotes.firstWhere((x) => x.id == 'c3').content, big); // overflow body restored
    expect(st.allNotes.firstWhere((x) => x.id == 't9').trashedAt, 1700000900000);
    expect(st.allNotes.firstWhere((x) => x.id == 'd4').format, NoteFormat.txt);
    expect(st.allNotes.firstWhere((x) => x.id == 'b2').readRatio, 0.5);
    expect(prefs.getString('jingjian.sync.v1'), '{"url":"https://x"}');

    // New features on migrated data.
    final live = st.notes;
    expect(SearchIndex.instance.search(live, '服务端协作').map((x) => x.id), ['a1']);
    expect(tagIndex(live).keys, containsAll(['工作', '长文']));
    final b2 = live.firstWhere((x) => x.id == 'b2');
    expect(linksFor(b2, live).backlinks.map((r) => r.note.id), ['a1']);
    await st.update(b2.copyWith(content: '# 读书\n- [x] 第一章'));
    expect(NoteHistory.instance.versions(NoteStore.keyFor('b2')).single.content, '# 读书\n- [ ] 第一章');

    // Running again (e.g. next start before doneKey stuck) is idempotent.
    expect(await LegacyMigration.importLegacy({'ls': {'jingjian.notes.v1': notesPayload}, 'overflow': {'c3': big}}, prefs: prefs), 0);

    // Survives a restart.
    await NoteStore.instance.init(root: root.path);
    expect(NoteStore.instance.allNotes.length, 5);
  });

  test('history: orphan cleanup, total budget, sync-delete clears history', () async {
    final st = NoteStore.instance;
    final h = NoteHistory.instance;
    final a = await st.create(content: '# A\n${'x' * 50000}');
    final b = await st.create(content: '# B\n1');
    for (var i = 0; i < 10; i++) {
      await h.record(NoteStore.keyFor(a.id), '# A v$i\n${'y' * 50000}', 'new', reason: 'sync');
    }
    await h.record(NoteStore.keyFor(b.id), '# B old', '# B\n1', reason: 'sync');
    await h.record(NoteStore.keyFor('ghost'), 'gone note', 'x', reason: 'sync');
    expect(h.versions(NoteStore.keyFor('ghost')), isNotEmpty);
    final before = h.totalBytes;
    final freed = await h.prune({NoteStore.keyFor(a.id), NoteStore.keyFor(b.id)}, budget: 200000);
    expect(freed, greaterThan(0));
    expect(h.totalBytes, lessThanOrEqualTo(200000));
    expect(h.totalBytes, before - freed);
    expect(h.versions(NoteStore.keyFor('ghost')), isEmpty);
    expect(h.versions(NoteStore.keyFor(b.id)), isNotEmpty); // small one kept
    expect(h.versions(NoteStore.keyFor(a.id)).first.content, startsWith('# A v9')); // newest kept

    // Remote deletion via sync replaceAll drops that note's history too.
    await st.replaceAll([for (final x in st.allNotes) if (x.id != b.id) x]);
    expect(h.versions(NoteStore.keyFor(b.id)), isEmpty);
  });
}
