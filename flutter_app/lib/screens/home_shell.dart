import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/note.dart';
import '../models/sync_config.dart';
import '../services/backlinks.dart';
import '../services/bookshelf.dart';
import '../services/app_prefs.dart';
import '../services/ebook_service.dart';
import '../services/export_service.dart';
import '../services/folder_tree.dart';
import '../services/import_service.dart';
import '../services/note_store.dart';
import '../services/note_text.dart';
import '../services/search_index.dart';
import '../services/collab/collab_session.dart';
import '../services/publish/blog_platforms.dart';
import '../widgets/collab_dialog.dart';
import '../widgets/pane_resizer.dart';
import '../services/sync/sync_service.dart';
import '../theme/app_theme.dart';
import 'editor_screen.dart';
import 'graph_screen.dart';
import 'image_library_screen.dart';
import 'settings_screen.dart';
import 'trash_screen.dart';

class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  final _store = NoteStore.instance;
  final _theme = ThemeController.instance;
  String? _activeId;
  bool _activeSpeak = false;
  String _query = '';
  bool _zen = false; // 专注模式: editor only, not persisted
  final _searchCtl = TextEditingController();
  bool get _filtered_ => _bookFilter != null || _folderFilter != null || _starredOnly || _tagFilter != null || _query.isNotEmpty;
  String? _folderFilter;
  String? _tagFilter;
  bool _starredOnly = false;
  String? _bookFilter; // selected book on the shelf
  final Set<String> _expanded = {};
  String _syncMsg = '';
  String? _syncErr;
  bool _syncing = false;

  Timer? _warmTimer;

  @override
  void dispose() {
    _warmTimer?.cancel();
    super.dispose();
  }

  @override
  void initState() {
    super.initState();
    final list = _sorted(_store.notes);
    if (list.isNotEmpty) _activeId = list.first.id;
    _maybeAutoSync();
    _warmTimer = Timer(const Duration(seconds: 4), () {
      if (mounted) warmLinkCache(_store.notes);
    });
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _maybeAutoSync() async {
    final cfg = AppPrefs.instance.readSyncConfig();
    if (cfg.provider == SyncProvider.off || !cfg.autoSync) return;
    await _syncNow(quiet: true);
  }

  List<Note> _sorted(List<Note> list) {
    final out = List<Note>.from(list);
    int pin(Note a, Note b) => (b.starred ? 1 : 0) - (a.starred ? 1 : 0);
    out.sort((a, b) {
      final s = pin(a, b);
      if (s != 0) return s;
      return switch (_theme.sort) {
        NoteSort.updated => b.updatedAt.compareTo(a.updatedAt),
        NoteSort.created => b.createdAt.compareTo(a.createdAt),
        NoteSort.title => a.title.toLowerCase().compareTo(b.title.toLowerCase()),
        NoteSort.opened => (b.openedAt ?? b.updatedAt).compareTo(a.openedAt ?? a.updatedAt),
      };
    });
    // Book chapters keep reading order inside a book folder.
    if (_bookFilter != null && _query.trim().isEmpty) return _filtered;
    if (_folderFilter != null && out.isNotEmpty && out.every((n) => n.bookId != null && n.bookId == out.first.bookId)) {
      out.sort((a, b) => (a.chapterIndex ?? 0).compareTo(b.chapterIndex ?? 0));
    }
    return out;
  }

  List<Note> get _filtered {
    if (_bookFilter != null) {
      // Chapters in the book's TOC order, never by modified time.
      final ch = bookChapters(_store.notes, _bookFilter!);
      return _query.trim().isEmpty ? ch : SearchIndex.instance.search(ch, _query);
    }
    var all = _store.notes;
    // Book chapters live on the shelf; keep 全部笔记 for notes (search still finds them).
    if (_folderFilter == null && _tagFilter == null && !_starredOnly && _query.trim().isEmpty) {
      all = all.where((n) => n.bookId == null).toList();
    }
    if (_folderFilter != null) all = notesInFolder(all, _folderFilter, includeNested: true);
    if (_starredOnly) all = all.where((n) => n.starred).toList();
    if (_tagFilter != null) all = all.where((n) => noteHasTag(n, _tagFilter!)).toList();
    if (_query.trim().isNotEmpty) all = SearchIndex.instance.search(all, _query);
    return _sorted(all);
  }

  void _openNote(String id, {bool speak = false}) {
    final wide = MediaQuery.sizeOf(context).width >= 720;
    if (wide) {
      setState(() {
        _activeId = id;
        _zen = false;
        _activeSpeak = speak;
      });
    } else {
      Navigator.of(context)
          .push(MaterialPageRoute(
            builder: (_) => EditorScreen(noteId: id, onChanged: () => setState(() {}), autoSpeak: speak),
          ))
          .then((_) => mounted ? setState(() {}) : null);
    }
  }

  Future<void> _newNote({NoteTemplate? template}) async {
    final t = template ?? noteTemplates.first;
    var content = t.build(DateTime.now());
    if (_tagFilter != null && t.id == 'blank') content = '\n\n#$_tagFilter';
    final note = await _store.create(content: content, folder: _folderFilter);
    if (!mounted) return;
    _openNote(note.id);
  }

  /// Open today's 日记 note, creating it (in the 日记 folder) if needed.
  Future<void> _openDaily() async {
    final now = DateTime.now();
    var note = findDailyNote(_store.notes, now);
    note ??= await _store.create(
      content: noteTemplates.firstWhere((t) => t.id == 'daily').build(now),
      folder: '日记',
    );
    if (!mounted) return;
    setState(() {});
    _openNote(note.id);
  }

  Future<void> _pickTemplate() async {
    final t = await showModalBottomSheet<NoteTemplate>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const ListTile(title: Text('新建', style: TextStyle(fontWeight: FontWeight.w600))),
            for (final t in noteTemplates)
              ListTile(title: Text(t.name), subtitle: Text(t.hint), onTap: () => Navigator.pop(ctx, t)),
          ],
        ),
      ),
    );
    if (t != null) await _newNote(template: t);
  }

  Future<void> _openTrash() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TrashScreen()));
    setState(() {
      if (_activeId != null && _store.byId(_activeId!)?.isTrashed != false) {
        _activeId = _store.notes.isEmpty ? null : _sorted(_store.notes).first.id;
      }
    });
  }

  Future<void> _showSyncError() async {
    final err = _syncErr;
    if (err == null) return;
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('同步未成功'),
        content: Text('$err\n\n笔记仍保存在本机，不受影响。可在 设置 → 同步 中检查配置后重试。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('知道了')),
          TextButton(
            onPressed: () {
              Navigator.pop(ctx);
              _syncNow();
            },
            child: const Text('重试'),
          ),
        ],
      ),
    );
  }

  Future<void> _syncNow({bool quiet = false}) async {
    if (_syncing) return;
    final cfg = AppPrefs.instance.readSyncConfig();
    if (cfg.provider == SyncProvider.off) {
      if (!quiet) _snack('尚未配置同步，请在 设置 → 同步 中选择方式');
      return;
    }
    setState(() {
      _syncing = true;
      _syncErr = null;
      _syncMsg = '同步中…';
    });
    try {
      final conflicts = await SyncService.instance.syncAndApply(activeId: _activeId);
      if (!mounted) return;
      setState(() => _syncMsg = SyncService.instance.status.message);
      for (final c in conflicts) {
        if (!mounted) break;
        await _resolveConflict(c.local, c.remote);
      }
      if (mounted) setState(() {});
    } catch (e) {
      final full = e.toString().replaceFirst('Exception: ', '');
      if (mounted) {
        setState(() {
          _syncErr = full;
          // Keep the note list calm: a short line, details on tap.
          _syncMsg = quiet ? '自动同步未成功 · 点此查看' : '同步未成功 · 点此查看';
        });
      }
    } finally {
      _syncing = false;
    }
  }

  Future<void> _resolveConflict(Note local, Note remote) async {
    final choice = await showDialog<String>(
      context: context,
      barrierDismissible: false,
      builder: (ctx) {
        Widget side(String label, Note n) => Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label, style: TextStyle(fontWeight: FontWeight.w600, color: JingjianColors.muted)),
                  const SizedBox(height: 4),
                  Container(
                    height: 180,
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: JingjianColors.overlay,
                      border: Border.all(color: JingjianColors.border),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: SingleChildScrollView(child: Text(n.content, style: const TextStyle(fontSize: 12))),
                  ),
                ],
              ),
            );
        return AlertDialog(
          title: Text('同步冲突：${local.title}'),
          content: SizedBox(
            width: 560,
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              side('本机', local),
              const SizedBox(width: 8),
              side('云端', remote),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, 'both'), child: const Text('两份都保留')),
            TextButton(onPressed: () => Navigator.pop(ctx, 'remote'), child: const Text('用云端')),
            TextButton(onPressed: () => Navigator.pop(ctx, 'local'), child: const Text('用本机')),
          ],
        );
      },
    );
    final now = DateTime.now().millisecondsSinceEpoch;
    switch (choice) {
      case 'local':
        await _store.update(local.copyWith(updatedAt: now));
      case 'remote':
        await _store.update(local.copyWith(content: remote.content, updatedAt: now));
      case 'both':
        await _store.update(local.copyWith(updatedAt: now));
        await _store.create(content: remote.content, folder: local.folder);
    }
  }

  Future<String?> _ask(String title, {String initial = '', String hint = ''}) async {
    final controller = TextEditingController(text: initial);
    final v = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(title),
        content: TextField(
          controller: controller,
          decoration: InputDecoration(hintText: hint),
          autofocus: true,
          onSubmitted: (s) => Navigator.pop(ctx, s.trim()),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('确定')),
        ],
      ),
    );
    controller.dispose();
    return v;
  }

  Future<void> _addFolder() async {
    final name = await _ask('新建文件夹', initial: _folderFilter == null ? '' : '$_folderFilter/', hint: '例如 手册/写作');
    if (name == null || normalizeFolder(name).isEmpty) return;
    await _store.addExtraFolder(name);
    setState(() {
      _expanded.add(normalizeFolder(name));
      _folderFilter = normalizeFolder(name);
    });
  }

  Future<void> _folderMenu(String path) async {
    final v = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text(path, style: const TextStyle(fontWeight: FontWeight.w600))),
          ListTile(leading: const Icon(Icons.note_add_outlined), title: const Text('在此新建笔记'), onTap: () => Navigator.pop(ctx, 'new')),
          ListTile(leading: const Icon(Icons.create_new_folder_outlined), title: const Text('新建子文件夹'), onTap: () => Navigator.pop(ctx, 'sub')),
          ListTile(leading: const Icon(Icons.drive_file_rename_outline), title: const Text('重命名 / 移动'), onTap: () => Navigator.pop(ctx, 'rename')),
          ListTile(leading: const Icon(Icons.ios_share), title: const Text('导出此文件夹…'), onTap: () => Navigator.pop(ctx, 'export')),
          ListTile(
            leading: Icon(Icons.delete_outline, color: JingjianColors.danger),
            title: Text('删除文件夹（笔记移到回收站）', style: TextStyle(color: JingjianColors.danger)),
            onTap: () => Navigator.pop(ctx, 'delete'),
          ),
        ]),
      ),
    );
    switch (v) {
      case 'new':
        setState(() => _folderFilter = path);
        await _newNote();
      case 'sub':
        final name = await _ask('新建子文件夹', hint: '名称');
        if (name == null || name.isEmpty) return;
        await _store.addExtraFolder('$path/$name');
        setState(() => _expanded.add(path));
      case 'rename':
        final to = await _ask('重命名文件夹', initial: path, hint: '新路径，用 / 分隔');
        if (to == null || normalizeFolder(to).isEmpty) return;
        final n = await _store.renameFolder(path, to);
        setState(() => _folderFilter = normalizeFolder(to));
        _snack('已移动 $n 篇笔记');
      case 'export':
        await _exportNotes(notesInFolder(_store.notes, path, includeNested: true), title: path.split('/').last);
      case 'delete':
        if (!mounted) return;
        final ok = await showDialog<bool>(
          context: context,
          builder: (ctx) => AlertDialog(
            title: Text('删除「$path」？'),
            content: const Text('文件夹内所有笔记会移到回收站，可恢复。'),
            actions: [
              TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
              TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('删除')),
            ],
          ),
        );
        if (ok != true) return;
        final n = await _store.trashFolder(path);
        setState(() {
          _folderFilter = null;
          if (_activeId != null && _store.byId(_activeId!)?.isTrashed != false) _activeId = null;
        });
        _snack('已将 $n 篇笔记移到回收站');
    }
  }

  Future<void> _exportNotes(List<Note> notes, {String? title}) async {
    if (notes.isEmpty) {
      _snack('没有可导出的笔记');
      return;
    }
    final f = await showModalBottomSheet<String>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          ListTile(title: Text('导出 ${notes.length} 篇', style: const TextStyle(fontWeight: FontWeight.w600))),
          ListTile(title: const Text('ZIP（Markdown + 图片，保留文件夹）'), onTap: () => Navigator.pop(ctx, 'zip')),
          ListTile(title: const Text('EPUB 电子书'), onTap: () => Navigator.pop(ctx, 'epub')),
          ListTile(title: const Text('PDF'), onTap: () => Navigator.pop(ctx, 'pdf')),
          ListTile(title: const Text('HTML（单文件）'), onTap: () => Navigator.pop(ctx, 'html')),
        ]),
      ),
    );
    if (f == null) return;
    try {
      final ex = ExportService.instance;
      String? path;
      if (f == 'zip') {
        final bytes = await ex.toZip(notes);
        path = await ex.deliver(bytes, '${safeFileName(title ?? '静笺笔记')}.zip', 'application/zip');
      } else {
        final fmt = switch (f) { 'epub' => ExportFormat.epub, 'pdf' => ExportFormat.pdf, _ => ExportFormat.html };
        path = await ex.export(notes, fmt, title: title ?? '静笺笔记');
      }
      if (path != null) _snack('已导出到 $path');
    } catch (e) {
      _snack('导出失败：${e.toString().replaceFirst('Exception: ', '')}');
    }
  }

  Future<void> _importFiles() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowMultiple: true,
      allowedExtensions: const ['md', 'markdown', 'txt', 'zip'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    var count = 0;
    for (final f in result.files) {
      final bytes = f.bytes;
      if (bytes == null) continue;
      try {
        count += await ImportService.instance.importFile(f.name, Uint8List.fromList(bytes), folder: _folderFilter);
      } catch (e) {
        _snack('${f.name}：${e.toString().replaceFirst('Exception: ', '')}');
      }
    }
    setState(() {});
    _snack('已导入 $count 篇笔记');
  }

  Future<void> _importEbook() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: EbookService.supportedExtensions,
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    final bytes = f.bytes;
    if (bytes == null) {
      _snack('无法读取文件');
      return;
    }
    try {
      final book = EbookService.instance.parse(Uint8List.fromList(bytes), f.name);
      final notes = await EbookService.instance.importAsNotes(book);
      setState(() {
        if (notes.isNotEmpty) {
          _bookFilter = notes.first.bookId;
          _folderFilter = null;
          _activeId = notes.first.id;
        }
      });
      _snack('已导入「${book.title}」共 ${notes.length} 章');
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _joinCollab() async {
    final mgr = CollabManager.instance;
    if (mgr.session != null) {
      _snack('已经在协作中，请先结束当前协作');
      return;
    }
    final s = await showJoinDialog(context);
    if (s == null || !mounted) return;
    final title = s.title.isEmpty ? '协作笔记' : s.title;
    final note = await _store.create(content: s.text.isEmpty ? '# $title\n\n' : s.text, folder: '协作');
    mgr.attach(s, note.id);
    _snack('已加入「$title」，编辑会实时同步');
    _openNote(note.id);
  }

  Future<void> _pullFromBlog() async {
    final prefs = await readPlatformPrefs();
    final ids = [
      for (final id in PlatformId.values.skip(1))
        if (prefs.sites[id]!.enabled && prefs.sites[id]!.ready) id,
    ];
    if (!mounted) return;
    if (ids.isEmpty) {
      _snack('先在 设置 → 博客平台 启用 WordPress / Typecho / Halo / Ghost / 语雀');
      return;
    }
    final id = ids.length == 1
        ? ids.first
        : await showDialog<PlatformId>(
            context: context,
            builder: (ctx) => SimpleDialog(title: const Text('从哪个平台拉回'), children: [
              for (final i in ids) SimpleDialogOption(onPressed: () => Navigator.pop(ctx, i), child: Text(platformLabel(i))),
            ]),
          );
    if (id == null || !mounted) return;
    List<({String remoteId, String title, String url, String hint})> posts;
    try {
      _snack('正在读取 ${platformLabel(id)} 文章列表…');
      posts = await BlogPlatformService.instance.listRemote(id, prefs);
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
      return;
    }
    if (!mounted) return;
    final pick = await showDialog<({String remoteId, String title, String url, String hint})>(
      context: context,
      builder: (ctx) => SimpleDialog(title: Text('${platformLabel(id)} 文章（${posts.length}）'), children: [
        if (posts.isEmpty) const Padding(padding: EdgeInsets.all(16), child: Text('没有文章')),
        for (final p in posts)
          SimpleDialogOption(
            onPressed: () => Navigator.pop(ctx, p),
            child: ListTile(dense: true, title: Text(p.title), subtitle: Text('${p.hint} · ${p.url}', maxLines: 1)),
          ),
      ]),
    );
    if (pick == null) return;
    try {
      final md = await BlogPlatformService.instance.readRemote(id, prefs, pick.remoteId);
      final note = await _store.create(content: md, folder: _folderFilter);
      await rememberTarget(note.id, id, pick.remoteId, pick.url);
      if (!mounted) return;
      _snack('已拉回「${pick.title}」，再次发布会更新原文');
      _openNote(note.id);
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _quickOpen() async {
    final id = await showDialog<String>(context: context, builder: (_) => _QuickOpen(notes: _sorted(_store.notes)));
    if (id != null && mounted) _openNote(id);
  }

  Future<void> _themeMenu() async {
    await showModalBottomSheet<void>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => SafeArea(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const ListTile(title: Text('外观', style: TextStyle(fontWeight: FontWeight.w600))),
            for (final id in ThemeId.values)
              ListTile(
                title: Text(themeLabels[id]!),
                trailing: _theme.themeId == id ? Icon(Icons.check, color: JingjianColors.accent) : null,
                onTap: () async {
                  await _theme.setTheme(id);
                  set(() {});
                },
              ),
            SwitchListTile(
              title: const Text('OLED 纯黑'),
              subtitle: Text(_theme.isDark ? '深色模式下使用 #000000 背景，更省电' : '仅在深色主题下生效'),
              value: _theme.oled,
              onChanged: (v) async {
                await _theme.setOled(v);
                set(() {});
              },
            ),
          ]),
        ),
      ),
    );
  }

  Widget _folderPane() {
    final tree = buildFolderTree(_store.notes, extraFolders: _store.extraFolders);
    final tags = tagIndex(_store.notes).entries.toList()..sort((a, b) => b.value.compareTo(a.value));
    final starred = _store.notes.where((n) => n.starred).length;
    final books = bookshelf(_store.notes);
    final plainCount = _store.notes.where((n) => n.bookId == null).length;
    return Material(
      color: JingjianColors.surface,
      child: ListView(
        children: [
          ListTile(
            dense: true,
            leading: const Icon(Icons.notes, size: 20),
            title: const Text('全部笔记'),
            trailing: Text('$plainCount', style: TextStyle(color: JingjianColors.muted, fontSize: 12)),
            selected: _folderFilter == null && !_starredOnly && _tagFilter == null && _bookFilter == null,
            onTap: () => setState(() {
              _bookFilter = null;
              _folderFilter = null;
              _starredOnly = false;
              _tagFilter = null;
            }),
          ),
          ListTile(
            dense: true,
            leading: const Icon(Icons.star_outline, size: 20),
            title: const Text('星标'),
            trailing: Text('$starred', style: TextStyle(color: JingjianColors.muted, fontSize: 12)),
            selected: _starredOnly,
            onTap: () => setState(() {
              _bookFilter = null;
              _starredOnly = !_starredOnly;
            }),
          ),
          ..._buildTree(tree.where((n) => !(n is FolderNode && isPureBookFolder(n.path, _store.notes))).toList(), 0),
          if (books.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 4),
              child: Text('书架', style: TextStyle(fontSize: 12, color: JingjianColors.muted, fontWeight: FontWeight.w600)),
            ),
          for (final b in books)
            ListTile(
              dense: true,
              leading: const Icon(Icons.menu_book_outlined, size: 20),
              title: Text(b.title, maxLines: 2, overflow: TextOverflow.ellipsis),
              subtitle: b.author == null ? null : Text(b.author!, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontSize: 11)),
              trailing: Text('${b.chapters.length} 章', style: TextStyle(color: JingjianColors.muted, fontSize: 12)),
              selected: _bookFilter == b.id,
              onTap: () => setState(() {
                _bookFilter = b.id;
                _folderFilter = null;
                _starredOnly = false;
                _tagFilter = null;
                if (!b.chapters.any((c) => c.id == _activeId)) _activeId = b.chapters.first.id;
              }),
            ),
          if (tags.isNotEmpty)
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 12, 12),
              child: Wrap(spacing: 6, runSpacing: 6, children: [
                for (final t in tags.take(60))
                  FilterChip(
                    visualDensity: VisualDensity.compact,
                    label: Text('#${t.key} ${t.value}', style: const TextStyle(fontSize: 12)),
                    selected: _tagFilter == t.key,
                    onSelected: (s) => setState(() => _tagFilter = s ? t.key : null),
                  ),
              ]),
            ),
        ],
      ),
    );
  }

  List<Widget> _buildTree(List<TreeNode> nodes, int depth) {
    final out = <Widget>[];
    for (final node in nodes) {
      if (node is FolderNode) {
        final open = _expanded.contains(node.path);
        final hasSub = node.children.any((c) => c is FolderNode);
        out.add(GestureDetector(
          onSecondaryTap: () => _folderMenu(node.path),
          child: ListTile(
            dense: true,
            contentPadding: EdgeInsets.only(left: 8.0 + depth * 12, right: 0),
            leading: Icon(open ? Icons.folder_open : Icons.folder_outlined, size: 20),
            title: Text(node.name, maxLines: 1, overflow: TextOverflow.ellipsis),
            selected: _folderFilter == node.path,
            trailing: Row(mainAxisSize: MainAxisSize.min, children: [
              if (hasSub)
                IconButton(
                  visualDensity: VisualDensity.compact,
                  icon: Icon(open ? Icons.expand_less : Icons.expand_more, size: 18),
                  onPressed: () => setState(() => open ? _expanded.remove(node.path) : _expanded.add(node.path)),
                ),
              IconButton(
                tooltip: '文件夹操作',
                visualDensity: VisualDensity.compact,
                icon: const Icon(Icons.more_vert, size: 18),
                onPressed: () => _folderMenu(node.path),
              ),
            ]),
            onTap: () => setState(() {
              _bookFilter = null;
              _folderFilter = node.path;
              _expanded.add(node.path);
            }),
            onLongPress: () => _folderMenu(node.path),
          ),
        ));
        if (open) out.addAll(_buildTree(node.children, depth + 1));
      }
    }
    return out;
  }

  Widget _noteList() {
    final notes = _filtered;
    return Material(
      color: JingjianColors.paper,
      child: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 4, 4),
            child: Row(children: [
              Expanded(
                child: TextField(
                  controller: _searchCtl,
                  decoration: InputDecoration(
                    hintText: '搜索笔记',
                    hintStyle: TextStyle(color: JingjianColors.muted),
                    prefixIcon: const Tooltip(
                      message: '多个词用空格分隔（需同时包含）；用 "引号" 搜索整句',
                      child: Icon(Icons.search, size: 20),
                    ),
                    filled: true,
                    fillColor: JingjianColors.overlay,
                    isDense: true,
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: JingjianColors.border),
                    ),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(10),
                      borderSide: BorderSide(color: JingjianColors.border),
                    ),
                    contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  ),
                  onChanged: (v) => setState(() => _query = v),
                ),
              ),
              PopupMenuButton<NoteSort>(
                tooltip: '排序',
                icon: const Icon(Icons.sort),
                initialValue: _theme.sort,
                onSelected: (s) async {
                  await _theme.setSort(s);
                  setState(() {});
                },
                itemBuilder: (_) => [
                  for (final s in NoteSort.values)
                    CheckedPopupMenuItem(value: s, checked: _theme.sort == s, child: Text(noteSortLabels[s]!)),
                ],
              ),
            ]),
          ),
          if (_syncMsg.isNotEmpty || _tagFilter != null || _folderFilter != null || _bookFilter != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Align(
                alignment: Alignment.centerLeft,
                child: GestureDetector(
                  onTap: _syncErr == null ? null : _showSyncError,
                  child: Text(
                  [
                    if (_bookFilter != null) '《${bookshelf(_store.notes).where((b) => b.id == _bookFilter).map((b) => b.title).firstOrNull ?? ''}》',
                    if (_folderFilter != null) _folderFilter!,
                    if (_tagFilter != null) '#$_tagFilter',
                    if (_syncMsg.isNotEmpty) _syncMsg,
                  ].join(' · '),
                  style: TextStyle(fontSize: 12, color: JingjianColors.muted),
                ),
                ),
              ),
            ),
          Expanded(
            child: notes.isEmpty
                ? Center(child: Text('暂无笔记', style: TextStyle(color: JingjianColors.muted)))
                : ListView.builder(
                    itemCount: notes.length,
                    itemBuilder: (context, index) {
                      final note = notes[index];
                      return ListTile(
                        selected: note.id == _activeId,
                        selectedTileColor: JingjianColors.overlay,
                        leading: note.starred ? Icon(Icons.star, size: 18, color: JingjianColors.accent) : null,
                        title: Text.rich(
                            highlightSpans(note.title, SearchIndex.terms(_query), JingjianColors.accent),
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(fontWeight: FontWeight.w600)),
                        subtitle: Text.rich(
                          highlightSpans([
                            if (note.folder != null && note.folder!.isNotEmpty && _folderFilter == null) note.folder!,
                            if (_query.trim().isNotEmpty)
                              SearchIndex.instance.snippet(note, _query)
                            else if (note.preview.isNotEmpty)
                              note.preview,
                          ].where((s) => s.isNotEmpty).join(' · '), SearchIndex.terms(_query), JingjianColors.accent),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: TextStyle(color: JingjianColors.muted, fontSize: 12),
                        ),
                        onTap: () => _openNote(note.id),
                        onLongPress: () async {
                          await _store.toggleStar(note.id);
                          setState(() {});
                          _snack(note.starred ? '已加星标' : '已取消星标');
                        },
                      );
                    },
                  ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final active = _activeId == null ? null : _store.byId(_activeId!);
    final width = MediaQuery.sizeOf(context).width;
    final wide = width >= 720;

    final T0 = ThemeController.instance;
    final bar = AppBar(
      leadingWidth: wide ? 96 : 56,
      leading: Row(mainAxisSize: MainAxisSize.min, children: [
        IconButton(
          tooltip: T0.sidebarCollapsed ? '展开文件夹栏' : '收起文件夹栏',
          icon: Icon(T0.sidebarCollapsed ? Icons.menu : Icons.menu_open),
          onPressed: () {
            T0.setCollapsed(sidebar: !T0.sidebarCollapsed);
            setState(() {});
          },
        ),
        if (wide)
          IconButton(
            tooltip: T0.listCollapsed ? '展开笔记列表' : '收起笔记列表（编辑区全宽）',
            icon: Icon(T0.listCollapsed ? Icons.view_list_outlined : Icons.fullscreen),
            onPressed: () {
              T0.setCollapsed(list: !T0.listCollapsed);
              setState(() {});
            },
          ),
      ]),
      title: const Text('静笺', style: TextStyle(fontWeight: FontWeight.w600)),
      actions: [
        IconButton(
          tooltip: '同步',
          onPressed: _syncing ? null : () => _syncNow(),
          icon: _syncing
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.sync),
        ),
        IconButton(
          tooltip: '图谱',
          onPressed: () async {
            await Navigator.of(context).push(MaterialPageRoute(builder: (_) => GraphScreen(focusId: _activeId)));
            if (mounted) setState(() {});
          },
          icon: const Icon(Icons.hub_outlined),
        ),
        PopupMenuButton<String>(
          tooltip: '菜单',
          onSelected: (v) async {
            switch (v) {
              case 'oled':
                await _theme.setOled(!_theme.oled);
                if (!_theme.isDark && _theme.oled) _snack('OLED 纯黑已开启，切换到深色主题后生效');
              case 'theme':
                await _themeMenu();
              case 'quick':
                await _quickOpen();
              case 'daily':
                await _openDaily();
              case 'folder':
                await _addFolder();
              case 'images':
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const ImageLibraryScreen()));
              case 'import':
                await _importFiles();
              case 'ebook':
                await _importEbook();
              case 'exportAll':
                await _exportNotes(_filtered, title: _folderFilter?.split('/').last ?? '静笺笔记');
              case 'trash':
                await _openTrash();
              case 'join':
                await _joinCollab();
              case 'pull':
                await _pullFromBlog();
              case 'settings':
                await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SettingsScreen()));
            }
            if (mounted) setState(() {});
          },
          itemBuilder: (_) => [
            CheckedPopupMenuItem(
              value: 'oled',
              checked: _theme.oled,
              child: Text(_theme.isDark ? 'OLED 纯黑' : 'OLED 纯黑（深色生效）'),
            ),
            const PopupMenuItem(value: 'theme', child: Text('主题…')),
            const PopupMenuDivider(),
            const PopupMenuItem(value: 'quick', child: Text('快速打开  Ctrl+P')),
            const PopupMenuItem(value: 'daily', child: Text('今日日记  Ctrl+Shift+D')),
            const PopupMenuItem(value: 'folder', child: Text('新建文件夹')),
            const PopupMenuItem(value: 'images', child: Text('图片库')),
            const PopupMenuItem(value: 'import', child: Text('导入 Markdown / TXT / ZIP')),
            const PopupMenuItem(value: 'ebook', child: Text('导入电子书（EPUB/MOBI/AZW3/FB2/TXT）')),
            const PopupMenuItem(value: 'exportAll', child: Text('导出当前列表…')),
            if (collabAvailable()) const PopupMenuItem(value: 'join', child: Text('加入协作…')),
            const PopupMenuItem(value: 'pull', child: Text('从博客拉回文章…')),
            const PopupMenuItem(value: 'trash', child: Text('回收站')),
            const PopupMenuItem(value: 'settings', child: Text('设置')),
          ],
        ),
        GestureDetector(
          onLongPress: _pickTemplate,
          child: IconButton(
            tooltip: '新建（长按选模板）',
            onPressed: _pickTemplate,
            icon: const Icon(Icons.note_add_outlined),
          ),
        ),
      ],
    );

    Widget body;
    final T = ThemeController.instance;
    // Phone: folders | list (editor opens full screen). Tablet/desktop:
    // folders | list | editor. Each pane can be dragged narrower until it
    // collapses; the AppBar buttons expand/collapse it again.
    final maxSidebar = wide ? ThemeController.sidebarMax : width * 0.45;
    final showSidebar = !T.sidebarCollapsed;
    final showList = wide && !T.listCollapsed;
    var sw = T.sidebarWidth.clamp(ThemeController.sidebarMin, maxSidebar < ThemeController.sidebarMin ? ThemeController.sidebarMin : maxSidebar);
    var lw = T.listWidth;
    var sidebarFits = showSidebar;
    if (wide) {
      // Keep at least 320px for the editor.
      final spare = width - 320 - (showSidebar ? sw : 0) - (showList ? lw : 0) - 20;
      if (spare < 0 && showList) lw = (lw + spare).clamp(ThemeController.listMin, ThemeController.listMax);
      final spare2 = width - 320 - (showSidebar ? sw : 0) - (showList ? lw : 0) - 20;
      if (spare2 < 0 && showSidebar) {
        final s2 = sw + spare2;
        if (s2 < ThemeController.sidebarMin) {
          sidebarFits = false; // not enough room right now; not persisted
        } else {
          sw = s2;
        }
      }
    }

    Widget sidebar() => ResizablePane(
          key: const ValueKey('sidebar-pane'),
          width: sw,
          collapsed: !sidebarFits,
          min: ThemeController.sidebarMin,
          max: maxSidebar,
          onCommit: (w, c) => setState(() {
            T.saveWidths(sidebar: w);
            T.setCollapsed(sidebar: c);
          }),
          onReset: () => setState(() {
            T.saveWidths(sidebar: 230);
            T.setCollapsed(sidebar: false);
          }),
          child: _folderPane(),
        );

    Widget list() => ResizablePane(
          key: const ValueKey('list-pane'),
          width: lw,
          collapsed: !showList,
          min: ThemeController.listMin,
          max: ThemeController.listMax,
          onCommit: (w, c) => setState(() {
            T.saveWidths(list: w);
            T.setCollapsed(list: c);
          }),
          onReset: () => setState(() {
            T.saveWidths(list: 300);
            T.setCollapsed(list: false);
          }),
          child: _noteList(),
        );

    if (!wide) {
      body = Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        sidebar(),
        Expanded(child: _noteList()),
      ]);
    } else {
      body = Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        if (!_zen) sidebar(),
        if (!_zen) list(),
        Expanded(
          child: active == null
              ? Center(child: Text(showList ? '选择或新建一篇笔记' : '列表已收起，点左上角按钮展开', style: TextStyle(color: JingjianColors.muted)))
              : EditorScreen(
                  key: ValueKey('${active.id}-$_activeSpeak'),
                  noteId: active.id,
                  embedded: true,
                  autoSpeak: _activeSpeak,
                  onChanged: () => setState(() {}),
                  onOpenNote: _openNote,
                  onFocusMode: (on) => setState(() => _zen = on),
                ),
        ),
      ]);
    }

    return CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyN, control: true): () => _newNote(),
        const SingleActivator(LogicalKeyboardKey.keyN, meta: true): () => _newNote(),
        const SingleActivator(LogicalKeyboardKey.keyP, control: true): _quickOpen,
        const SingleActivator(LogicalKeyboardKey.keyP, meta: true): _quickOpen,
        const SingleActivator(LogicalKeyboardKey.keyO, control: true): _quickOpen,
        const SingleActivator(LogicalKeyboardKey.keyD, control: true, shift: true): _openDaily,
        const SingleActivator(LogicalKeyboardKey.backslash, control: true): () {
          ThemeController.instance.setCollapsed(sidebar: !ThemeController.instance.sidebarCollapsed);
          setState(() {});
        },
      },
      child: PopScope(
        // Android back: first clear filters / search, then leave the app.
        canPop: !_filtered_,
        onPopInvokedWithResult: (didPop, _) {
          if (didPop) return;
          setState(() {
            _folderFilter = null;
            _starredOnly = false;
            _tagFilter = null;
            _query = '';
            _searchCtl.clear();
          });
        },
        child: Focus(autofocus: true, child: Scaffold(appBar: _zen && wide ? null : bar, body: body)),
      ),
    );
  }
}

class _QuickOpen extends StatefulWidget {
  const _QuickOpen({required this.notes});
  final List<Note> notes;

  @override
  State<_QuickOpen> createState() => _QuickOpenState();
}

class _QuickOpenState extends State<_QuickOpen> {
  String q = '';
  int sel = 0;

  List<Note> get hits {
    final s = q.trim().toLowerCase();
    if (s.isEmpty) return widget.notes.take(30).toList();
    final starts = <Note>[], contains = <Note>[], body = <Note>[];
    for (final n in widget.notes) {
      final t = n.title.toLowerCase();
      if (t.startsWith(s)) {
        starts.add(n);
      } else if (t.contains(s)) {
        contains.add(n);
      } else if (SearchIndex.instance.matches(n, [s])) {
        body.add(n);
      }
    }
    return [...starts, ...contains, ...body].take(50).toList();
  }

  @override
  Widget build(BuildContext context) {
    final list = hits;
    return Dialog(
      alignment: Alignment.topCenter,
      insetPadding: const EdgeInsets.fromLTRB(16, 64, 16, 16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 560, maxHeight: 480),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Padding(
            padding: const EdgeInsets.all(8),
            child: CallbackShortcuts(
              bindings: {
                const SingleActivator(LogicalKeyboardKey.arrowDown): () =>
                    setState(() => sel = (sel + 1).clamp(0, list.isEmpty ? 0 : list.length - 1)),
                const SingleActivator(LogicalKeyboardKey.arrowUp): () =>
                    setState(() => sel = (sel - 1).clamp(0, list.isEmpty ? 0 : list.length - 1)),
              },
              child: TextField(
                autofocus: true,
                decoration: const InputDecoration(hintText: '输入标题快速打开', prefixIcon: Icon(Icons.search)),
                onChanged: (v) => setState(() {
                  q = v;
                  sel = 0;
                }),
                onSubmitted: (_) {
                  if (list.isNotEmpty) Navigator.pop(context, list[sel.clamp(0, list.length - 1)].id);
                },
              ),
            ),
          ),
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              itemCount: list.length,
              itemBuilder: (_, i) => ListTile(
                dense: true,
                selected: i == sel,
                selectedTileColor: JingjianColors.overlay,
                title: Text(list[i].title, maxLines: 1, overflow: TextOverflow.ellipsis),
                subtitle: list[i].folder == null ? null : Text(list[i].folder!, style: const TextStyle(fontSize: 11)),
                onTap: () => Navigator.pop(context, list[i].id),
              ),
            ),
          ),
        ]),
      ),
    );
  }
}
