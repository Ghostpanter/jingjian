import 'package:flutter/material.dart';

import '../models/note.dart';
import '../services/note_store.dart';
import '../theme/app_theme.dart';
import 'editor_screen.dart';
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

  @override
  void initState() {
    super.initState();
    final list = _store.notes;
    if (list.isNotEmpty) _activeId = list.first.id;
  }

  List<Note> get _filtered {
    final q = _query.trim().toLowerCase();
    final all = _store.notes;
    if (q.isEmpty) return all;
    return all
        .where((n) =>
            n.title.toLowerCase().contains(q) || n.content.toLowerCase().contains(q))
        .toList();
  }

  Future<void> _newNote() async {
    final note = await _store.create(content: '# 新笔记\n\n');
    setState(() => _activeId = note.id);
  }

  Future<void> _openTrash() async {
    await Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const TrashScreen()),
    );
    setState(() {
      if (_activeId != null && _store.byId(_activeId!)?.isTrashed == true) {
        _activeId = _store.notes.isEmpty ? null : _store.notes.first.id;
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final notes = _filtered;
    final active = _activeId == null ? null : _store.byId(_activeId!);
    final wide = MediaQuery.sizeOf(context).width >= 720;

    final list = Column(
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
                      title: Text(
                        note.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontWeight: FontWeight.w600),
                      ),
                      subtitle: note.preview.isEmpty
                          ? null
                          : Text(
                              note.preview,
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: const TextStyle(color: JingjianColors.muted, fontSize: 12),
                            ),
                      onTap: () {
                        if (wide) {
                          setState(() => _activeId = note.id);
                        } else {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => EditorScreen(
                                noteId: note.id,
                                onChanged: () => setState(() {}),
                              ),
                            ),
                          ).then((_) => setState(() {}));
                        }
                      },
                    );
                  },
                ),
        ),
      ],
    );

    final bar = AppBar(
      title: const Text('静笺', style: TextStyle(fontWeight: FontWeight.w600)),
      actions: [
        IconButton(
          tooltip: '回收站',
          onPressed: _openTrash,
          icon: const Icon(Icons.delete_outline),
        ),
        IconButton(
          tooltip: '新建',
          onPressed: _newNote,
          icon: const Icon(Icons.note_add_outlined),
        ),
      ],
    );

    if (!wide) {
      return Scaffold(appBar: bar, body: list);
    }

    return Scaffold(
      appBar: bar,
      body: Row(
        children: [
          SizedBox(width: 300, child: list),
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
