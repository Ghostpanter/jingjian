import 'package:flutter/material.dart';

import '../services/note_store.dart';
import '../theme/app_theme.dart';

class TrashScreen extends StatefulWidget {
  const TrashScreen({super.key});

  @override
  State<TrashScreen> createState() => _TrashScreenState();
}

class _TrashScreenState extends State<TrashScreen> {
  final _store = NoteStore.instance;

  @override
  Widget build(BuildContext context) {
    final items = _store.trash;
    return Scaffold(
      appBar: AppBar(title: const Text('回收站')),
      body: items.isEmpty
          ? const Center(child: Text('回收站是空的', style: TextStyle(color: JingjianColors.muted)))
          : ListView.builder(
              itemCount: items.length,
              itemBuilder: (context, index) {
                final note = items[index];
                return ListTile(
                  title: Text(note.title),
                  subtitle: const Text('已删除', style: TextStyle(color: JingjianColors.muted)),
                  trailing: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      TextButton(
                        onPressed: () async {
                          await _store.restore(note.id);
                          setState(() {});
                        },
                        child: const Text('恢复'),
                      ),
                      TextButton(
                        onPressed: () async {
                          await _store.purge(note.id);
                          setState(() {});
                        },
                        child: const Text('彻底删除', style: TextStyle(color: JingjianColors.danger)),
                      ),
                    ],
                  ),
                );
              },
            ),
    );
  }
}
