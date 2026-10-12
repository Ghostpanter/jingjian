import 'dart:typed_data';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../models/note.dart';
import '../models/sync_config.dart';
import '../services/app_prefs.dart';
import '../services/ebook_service.dart';
import '../services/folder_tree.dart';
import '../services/note_store.dart';
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
  String? _activeId;
  String _query = '';
  String? _folderFilter;
  final Set<String> _expanded = {};
  String _syncMsg = '';

  @override
  void initState() {
    super.initState();
    final list = _store.notes;
    if (list.isNotEmpty) _activeId = list.first.id;
    _maybeAutoSync();
  }

  Future<void> _maybeAutoSync() async {
    final cfg = AppPrefs.instance.readSyncConfig();
    if (cfg.provider == SyncProvider.off || !cfg.autoSync) return;
    try {
      await SyncService.instance.syncAndApply(activeId: _activeId);
      if (mounted) setState(() => _syncMsg = SyncService.instance.status.message);
    } catch (_) {}
  }

  List<Note> get _filtered {
    var all = _store.notes;
    if (_folderFilter != null) {
      all = notesInFolder(all, _folderFilter, includeNested: true);
    }
    final q = _query.trim().toLowerCase();
    if (q.isEmpty) return all;
    return all
        .where((n) =>
            n.title.toLowerCase().contains(q) || n.content.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _newNote() async {
    final note = await _store.create(
      content: '# 新笔记\n\n',
      folder: _folderFilter,
    );
    setState(() => _activeId = note.id);
  }

  Future<void> _openTrash() async {
    await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const TrashScreen()));
    setState(() {
      if (_activeId != null && _store.byId(_activeId!)?.isTrashed == true) {
        _activeId = _store.notes.isEmpty ? null : _store.notes.first.id;
      }
    });
  }

  Future<void> _syncNow() async {
    setState(() => _syncMsg = '同步中…');
    try {
      await SyncService.instance.syncAndApply(activeId: _activeId);
      setState(() => _syncMsg = SyncService.instance.status.message);
    } catch (e) {
      setState(() => _syncMsg = e.toString().replaceFirst('Exception: ', ''));
    }
  }

  Future<void> _addFolder() async {
    final controller = TextEditingController();
    final name = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('新建文件夹'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: '例如 手册/写作'),
          autofocus: true,
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('创建')),
        ],
      ),
    );
    if (name == null || name.isEmpty) return;
    await _store.addExtraFolder(name);
    setState(() {
      _expanded.add(normalizeFolder(name));
      _folderFilter = normalizeFolder(name);
    });
  }

  Future<void> _importEbook() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: const ['txt', 'md', 'html', 'htm', 'epub'],
      withData: true,
    );
    if (result == null || result.files.isEmpty) return;
    final f = result.files.first;
    final bytes = f.bytes;
    if (bytes == null) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('无法读取文件')));
      }
      return;
    }
    try {
      final book = EbookService.instance.parse(Uint8List.fromList(bytes), f.name);
      final notes = await EbookService.instance.importAsNotes(book);
      setState(() {
        if (notes.isNotEmpty) {
          _activeId = notes.first.id;
          _folderFilter = '电子书/${book.title}';
        }
      });
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('已导入「${book.title}」共 ${notes.length} 章')),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Widget _folderPane() {
    final tree = buildFolderTree(_store.notes, extraFolders: _store.extraFolders);
    return ListView(
      children: [
        ListTile(
          dense: true,
          leading: const Icon(Icons.notes, size: 20),
          title: const Text('全部笔记'),
          selected: _folderFilter == null,
          onTap: () => setState(() => _folderFilter = null),
        ),
        ..._buildTree(tree, 0),
      ],
    );
  }

  List<Widget> _buildTree(List<TreeNode> nodes, int depth) {
    final out = <Widget>[];
    for (final node in nodes) {
      if (node is FolderNode) {
        final open = _expanded.contains(node.path);
        out.add(ListTile(
          dense: true,
          contentPadding: EdgeInsets.only(left: 8.0 + depth * 12, right: 8),
          leading: Icon(open ? Icons.folder_open : Icons.folder_outlined, size: 20),
          title: Text(node.name, maxLines: 1, overflow: TextOverflow.ellipsis),
          selected: _folderFilter == node.path,
          trailing: IconButton(
            icon: Icon(open ? Icons.expand_less : Icons.expand_more, size: 18),
            onPressed: () => setState(() {
              if (open) {
                _expanded.remove(node.path);
              } else {
                _expanded.add(node.path);
              }
            }),
          ),
          onTap: () => setState(() => _folderFilter = node.path),
        ));
        if (open) out.addAll(_buildTree(node.children, depth + 1));
      }
    }
    return out;
  }

  Widget _noteList() {
    final notes = _filtered;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 8, 12, 4),
          child: TextField(
            decoration: InputDecoration(
              hintText: '搜索笔记',
              hintStyle: TextStyle(color: JingjianColors.muted),
              prefixIcon: const Icon(Icons.search, size: 20),
              filled: true,
              fillColor: JingjianColors.overlay,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(10),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            ),
            onChanged: (v) => setState(() => _query = v),
          ),
        ),
        if (_syncMsg.isNotEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: Align(
              alignment: Alignment.centerLeft,
              child: Text(_syncMsg, style: const TextStyle(fontSize: 12, color: JingjianColors.muted)),
            ),
          ),
        Expanded(
          child: notes.isEmpty
              ? const Center(child: Text('暂无笔记', style: TextStyle(color: JingjianColors.muted)))
              : ListView.builder(
                  itemCount: notes.length,
                  itemBuilder: (context, index) {
                    final note = notes[index];
                    final selected = note.id == _activeId;
                    return ListTile(
                      selected: selected,
                      selectedTileColor: JingjianColors.overlay,
                      leading: note.starred
                          ? const Icon(Icons.star, size: 18, color: JingjianColors.accent)
                          : null,
                      title: Text(
                        note.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: Text(
                        [
                          if (note.folder != null && note.folder!.isNotEmpty) note.folder!,
                          if (note.preview.isNotEmpty) note.preview,
                        ].join(' · '),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: JingjianColors.muted, fontSize: 12),
                      ),
                      onTap: () {
                        final wide = MediaQuery.sizeOf(context).width >= 720;
                        if (wide) {
                          setState(() => _activeId = note.id);
                        } else {
                          Navigator.of(context)
                              .push(MaterialPageRoute(
                                builder: (_) => EditorScreen(
                                  noteId: note.id,
                                  onChanged: () => setState(() {}),
                                ),
                              ))
                              .then((_) => setState(() {}));
                        }
                      },
                      onLongPress: () async {
                        await _store.toggleStar(note.id);
                        setState(() {});
                      },
                    );
                  },
                ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    final active = _activeId == null ? null : _store.byId(_activeId!);
    final wide = MediaQuery.sizeOf(context).width >= 720;
    final veryWide = MediaQuery.sizeOf(context).width >= 1000;

    final bar = AppBar(
      title: const Text('静笺', style: TextStyle(fontWeight: FontWeight.w600)),
      actions: [
        IconButton(
          tooltip: '同步',
          onPressed: _syncNow,
          icon: const Icon(Icons.sync),
        ),
        IconButton(
          tooltip: '图谱',
          onPressed: () => Navigator.of(context).push(
            MaterialPageRoute(builder: (_) => GraphScreen(focusId: _activeId)),
          ),
          icon: const Icon(Icons.hub_outlined),
        ),
        PopupMenuButton<String>(
          onSelected: (v) async {
            switch (v) {
              case 'folder':
                await _addFolder();
              case 'images':
                await Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ImageLibraryScreen()),
                );
              case 'ebook':
                await _importEbook();
              case 'trash':
                await _openTrash();
              case 'settings':
                await Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const SettingsScreen()),
                );
                setState(() {});
            }
          },
          itemBuilder: (_) => const [
            PopupMenuItem(value: 'folder', child: Text('新建文件夹')),
            PopupMenuItem(value: 'images', child: Text('图片库')),
            PopupMenuItem(value: 'ebook', child: Text('导入电子书')),
            PopupMenuItem(value: 'trash', child: Text('回收站')),
            PopupMenuItem(value: 'settings', child: Text('设置')),
          ],
        ),
        IconButton(
          tooltip: '新建',
          onPressed: _newNote,
          icon: const Icon(Icons.note_add_outlined),
        ),
      ],
    );

    if (!wide) {
      return Scaffold(
        appBar: bar,
        body: Column(
          children: [
            SizedBox(height: 160, child: _folderPane()),
            const Divider(height: 1),
            Expanded(child: _noteList()),
          ],
        ),
      );
    }

    return Scaffold(
      appBar: bar,
      body: Row(
        children: [
          if (veryWide) ...[
            SizedBox(width: 220, child: _folderPane()),
            const VerticalDivider(width: 1),
          ],
          SizedBox(width: 300, child: _noteList()),
          const VerticalDivider(width: 1),
          Expanded(
            child: active == null
                ? const Center(
                    child: Text('选择或新建一篇笔记', style: TextStyle(color: JingjianColors.muted)),
                  )
                : EditorScreen(
                    key: ValueKey(active.id),
                    noteId: active.id,
                    embedded: true,
                    onChanged: () => setState(() {}),
                  ),
          ),
        ],
      ),
    );
  }
}
