import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:fast_gbk/fast_gbk.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/models/note.dart';
import 'package:jingjian/services/app_prefs.dart';
import 'package:jingjian/services/ebook_service.dart';
import 'package:jingjian/services/export_service.dart';
import 'package:jingjian/services/image_store.dart';
import 'package:jingjian/services/legacy_migration.dart';
import 'package:jingjian/services/note_store.dart';
import 'package:jingjian/services/note_text.dart';
import 'package:jingjian/services/sync/sync_merge.dart';
import 'package:shared_preferences/shared_preferences.dart';

Note n(String id, String c, {int u = 1000}) => Note(id: id, content: c, createdAt: 1, updatedAt: u);

void main() {
  late Directory root;
  setUpAll(() async {
    SharedPreferences.setMockInitialValues({});
    await AppPrefs.instance.init();
    root = await Directory.systemTemp.createTemp('jj183');
    await ImageStore.instance.init(root: root.path);
    await NoteStore.instance.init(root: root.path);
  });
  tearDownAll(() => root.delete(recursive: true));

  test('note store persists, survives a corrupt file, and never escapes its folder', () async {
    final st = NoteStore.instance;
    await st.insert(n('../../evil', 'x'));
    await st.insert(n('ok-1', 'hello'));
    final dir = Directory('${root.path}/jingjian/notes');
    expect(dir.listSync().every((f) => f.parent.path == dir.path), true);
    expect(File('${root.path}/evil.json').existsSync(), false);
    File('${dir.path}/broken.json').writeAsStringSync('{"id": "br');
    await st.init(root: root.path);
    expect(st.byId('ok-1')?.content, 'hello');
    expect(st.byId('../../evil')?.content, 'x');
    expect(dir.listSync().any((f) => f.path.contains('broken.json.corrupt-')), true);
  });

  test('image store round-trip by id', () async {
    final png = Uint8List.fromList([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0, 1, 2]);
    final s = await ImageStore.instance.saveBytes(png, 'a.png', id: 'abc123');
    expect(s.path, 'images/abc123.png');
    expect(ImageStore.instance.imageSync('abc123')?.bytes, png);
    expect(ImageStore.instance.imageForSrc('./images/abc123.png')?.mime, 'image/png');
    expect((await ImageStore.instance.saveBytes(png, 'x.png', id: '../bad')).id.contains('/'), false);
  });

  test('1.7.x data import: notes, overflow body, trash, prefs, no duplicate welcome', () async {
    final st = NoteStore.instance;
    for (final x in List.of(st.allNotes)) {
      await st.purge(x.id);
    }
    final welcome = await st.create(content: '# 欢迎使用静笺\n\n');
    expect(welcome.createdAt, welcome.updatedAt);
    final prefs = await SharedPreferences.getInstance();
    final data = {
      'ls': {
        'jingjian.notes.v1': jsonEncode({
          'state': {
            'notes': [
              {'id': 'old-1', 'content': '# 旧笔记\n正文', 'createdAt': 5, 'updatedAt': 9, 'folder': '工作'},
              {'id': 'old-2', 'content': '# 大', 'createdAt': 5, 'updatedAt': 9, 'overflow': true},
              {'bad': true},
            ],
            'folders': ['空文件夹'],
          },
        }),
        'jingjian.trash.v1': jsonEncode([
          {'id': 'old-3', 'content': '删掉的', 'createdAt': 1, 'updatedAt': 2, 'deletedAt': 3},
        ]),
        'jingjian.sync.v1': jsonEncode({'provider': 'webdav', 'webdavUser': 'u'}),
      },
      'overflow': {'old-2': '# 大\n${'很长' * 1000}'},
    };
    final count = await LegacyMigration.importLegacy(data, prefs: prefs);
    expect(count, 3);
    expect(st.byId('old-1')!.folder, '工作');
    expect(st.byId('old-2')!.content.length > 1000, true);
    expect(st.byId('old-3')!.isTrashed, true);
    expect(st.byId(welcome.id), isNull, reason: 'untouched welcome note is removed');
    expect(st.extraFolders, contains('空文件夹'));
    expect(AppPrefs.instance.readSyncConfig().webdavUser, 'u');
    // running again does not duplicate
    expect(await LegacyMigration.importLegacy(data, prefs: prefs), 0);
  });

  test('sync: edits/creates/deletes made during a sync are not lost', () {
    final a = n('a', 'v1'), b = n('b', 'v1'), gone = n('g', 'x');
    final snapshot = [a, b, gone];
    final merged = [n('a', 'remote', u: 2000), b, gone];
    final current = [a, n('b', 'typed during sync', u: 3000), n('new', 'created during sync')];
    final out = {for (final x in reconcileAfterSync(snapshot: snapshot, current: current, merged: merged)) x.id: x};
    expect(out['a']!.content, 'remote');
    expect(out['b']!.content, 'typed during sync');
    expect(out.containsKey('new'), true);
    expect(out.containsKey('g'), false);
  });

  test('sync: a local note edited after an old tombstone is kept', () {
    final r = mergeNotes(MergeInput(local: [n('t', 'back', u: 5000)], remote: const [], tombstones: {'t': 4000}));
    expect(r.notes.single.id, 't');
    expect(r.tombstones.containsKey('t'), false);
    final r2 = mergeNotes(MergeInput(local: [n('t', 'old', u: 3000)], remote: const [], tombstones: {'t': 4000}));
    expect(r2.notes, isEmpty);
  });

  test('find/replace edge cases', () {
    expect(replaceMatchAt('a\nab', 2, r'^a', 'X', regex: true)?.text, 'a\nXb');
    expect(replaceMatchAt('xab', 2, r'(?<=a)b', 'B', regex: true)?.text, 'xaB');
    expect(replaceAllMatches('ab', r'(a)', r'[$&|$$|$1|$12]', regex: true), '[a|\$|a|a2]b');
    expect(replaceAllMatches('a\nb', r'^', '> ', regex: true), '> a\n> b');
    expect(countMatches('a\nb', r'^', regex: true), 2);
    expect(replaceAllMatches('1+1', '+', '加'), '1加1');
    expect(findAll('x', '(', regex: true), isEmpty);
  });

  test('GBK text files decode (old app did GB18030)', () {
    final gbk = Uint8List.fromList(const GbkCodec().encode('第一章 风起\n这是测试正文。' * 20));
    final t = EbookService.instance.decodeBytes(gbk);
    expect(t.startsWith('第一章 风起'), true);
    expect(EbookService.instance.decodeBytes(Uint8List.fromList(utf8.encode('中文'))), '中文');
  });

  test('safe export file names', () {
    expect(safeFileName('${'😀' * 70}x').runes.length, 60);
    expect(safeFileName('a/b:c?'), 'a_b_c_');
    expect(safeFileName('报告. '), '报告');
    expect(safeFileName('CON'), '_CON');
    expect(safeFileName('   '), '未命名笔记');
  });

  test('cannot move a folder into its own subfolder', () async {
    final st = NoteStore.instance;
    await st.insert(Note(id: 'f1', content: 'x', createdAt: 1, updatedAt: 1, folder: '甲'));
    expect(() => st.renameFolder('甲', '甲/乙'), throwsException);
    expect(await st.renameFolder('甲', '丙'), 1);
    expect(st.byId('f1')!.folder, '丙');
  });
}
