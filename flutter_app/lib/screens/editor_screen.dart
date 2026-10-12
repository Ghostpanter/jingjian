import 'dart:async';

import 'package:flutter/material.dart';

import '../models/note.dart';
import '../services/note_store.dart';
import '../theme/app_theme.dart';
import '../widgets/markdown_preview.dart';

enum _Pane { edit, split, preview }

class EditorScreen extends StatefulWidget {
  const EditorScreen({
    super.key,
    required this.noteId,
    this.embedded = false,
    this.onChanged,
  });

  final String noteId;
  final bool embedded;
  final VoidCallback? onChanged;

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends State<EditorScreen> {
  final _store = NoteStore.instance;
  late final TextEditingController _controller;
  late final FocusNode _focus;
  Timer? _debounce;
  _Pane _pane = _Pane.split;
  Note? _note;

  @override
  void initState() {
    super.initState();
    _note = _store.byId(widget.noteId);
    _controller = TextEditingController(text: _note?.content ?? '');
    _focus = FocusNode();
    // Prefer edit-first on narrow phones for IME comfort.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!widget.embedded && MediaQuery.sizeOf(context).width < 720) {
        setState(() => _pane = _Pane.edit);
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _onText(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () async {
      final note = _store.byId(widget.noteId);
      if (note == null) return;
      if (note.content == value) return;
      final next = note.copyWith(
        content: value,
        updatedAt: DateTime.now().millisecondsSinceEpoch,
      );
      await _store.update(next);
      _note = next;
      widget.onChanged?.call();
      if (mounted) setState(() {});
    });
    setState(() {});
  }

  Future<void> _trash() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('移到回收站？'),
        content: const Text('可在回收站恢复。'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('移到回收站')),
        ],
      ),
    );
    if (ok != true) return;
    await _store.moveToTrash(widget.noteId);
    widget.onChanged?.call();
    if (!widget.embedded && mounted) Navigator.of(context).pop();
  }

  void _cyclePane() {
    setState(() {
      _pane = switch (_pane) {
        _Pane.edit => _Pane.split,
        _Pane.split => _Pane.preview,
        _Pane.preview => _Pane.edit,
      };
    });
  }

  @override
  Widget build(BuildContext context) {
    final note = _store.byId(widget.noteId);
    if (note == null) {
      return const Scaffold(body: Center(child: Text('笔记不存在')));
    }

    final editor = TextField(
      controller: _controller,
      focusNode: _focus,
      maxLines: null,
      expands: true,
      keyboardType: TextInputType.multiline,
      textAlignVertical: TextAlignVertical.top,
      // Critical for Chinese IME: no inputFormatters, no smart dashes.
      style: const TextStyle(
        fontSize: 16,
        height: 1.65,
        color: JingjianColors.ink,
        fontFamily: 'sans-serif',
      ),
      cursorColor: JingjianColors.accent,
      decoration: const InputDecoration(
        contentPadding: EdgeInsets.fromLTRB(16, 12, 16, 24),
        border: InputBorder.none,
      ),
      onChanged: _onText,
    );

    final preview = MarkdownPreview(content: _controller.text);

    Widget body;
    switch (_pane) {
      case _Pane.edit:
        body = editor;
      case _Pane.preview:
        body = preview;
      case _Pane.split:
        body = LayoutBuilder(
          builder: (context, constraints) {
            final vertical = constraints.maxWidth < 640;
            if (vertical) {
              return Column(
                children: [
                  Expanded(child: editor),
                  const Divider(height: 1),
                  Expanded(child: preview),
                ],
              );
            }
            return Row(
              children: [
                Expanded(child: editor),
                const VerticalDivider(width: 1),
                Expanded(child: preview),
              ],
            );
          },
        );
    }

    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: JingjianColors.paper,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            child: Row(
              children: [
                if (!widget.embedded)
                  IconButton(
                    tooltip: '返回',
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.arrow_back),
                  ),
                Expanded(
                  child: Text(
                    note.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                  ),
                ),
                IconButton(
                  tooltip: '源码 / 分栏 / 预览',
                  onPressed: _cyclePane,
                  icon: Icon(switch (_pane) {
                    _Pane.edit => Icons.edit_note,
                    _Pane.split => Icons.vertical_split,
                    _Pane.preview => Icons.visibility_outlined,
                  }),
                ),
                IconButton(
                  tooltip: '移到回收站',
                  onPressed: _trash,
                  icon: const Icon(Icons.delete_outline),
                ),
              ],
            ),
          ),
        ),
        const Divider(height: 1),
        Expanded(child: body),
      ],
    );

    if (widget.embedded) return content;
    return Scaffold(body: SafeArea(child: content));
  }
}
