import 'dart:async';

import 'package:flutter/material.dart';

import '../services/blog_service.dart';
import '../services/export_service.dart';
import '../services/folder_tree.dart';
import '../services/image_store.dart';
import '../services/note_store.dart';
import '../services/tts_service.dart';
import '../theme/app_theme.dart';
import '../widgets/markdown_preview.dart';
import 'image_library_screen.dart';

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
  bool _ttsOn = false;

  @override
  void initState() {
    super.initState();
    final note = _store.byId(widget.noteId);
    _controller = TextEditingController(text: note?.content ?? '');
    _focus = FocusNode();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!widget.embedded && MediaQuery.sizeOf(context).width < 720) {
        setState(() => _pane = _Pane.edit);
      }
      final n = _store.byId(widget.noteId);
      if (n != null) {
        _store.update(n.copyWith(openedAt: DateTime.now().millisecondsSinceEpoch));
      }
    });
  }

  @override
  void dispose() {
    _debounce?.cancel();
    _controller.dispose();
    _focus.dispose();
    TtsService.instance.stop();
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

  Future<void> _toggleTts() async {
    if (_ttsOn) {
      await TtsService.instance.stop();
      setState(() => _ttsOn = false);
      return;
    }
    setState(() => _ttsOn = true);
    await TtsService.instance.speak(_controller.text);
    if (mounted) setState(() => _ttsOn = TtsService.instance.speaking);
  }

  Future<void> _export() async {
    final note = _store.byId(widget.noteId);
    if (note == null) return;
    final format = await showModalBottomSheet<ExportFormat>(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('Markdown'),
              onTap: () => Navigator.pop(ctx, ExportFormat.markdown),
            ),
            ListTile(
              title: const Text('纯文本'),
              onTap: () => Navigator.pop(ctx, ExportFormat.plainText),
            ),
            ListTile(
              title: const Text('HTML'),
              onTap: () => Navigator.pop(ctx, ExportFormat.html),
            ),
            ListTile(
              title: const Text('RTF'),
              onTap: () => Navigator.pop(ctx, ExportFormat.rtf),
            ),
          ],
        ),
      ),
    );
    if (format == null) return;
    try {
      await ExportService.instance.shareNote(note, format);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('导出失败: $e')),
        );
      }
    }
  }

  Future<void> _publish() async {
    final note = _store.byId(widget.noteId);
    if (note == null) return;
    try {
      final path = await BlogService.instance.publish(note);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('已发布到 $path')));
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(e.toString().replaceFirst('Exception: ', ''))),
        );
      }
    }
  }

  Future<void> _insertImage() async {
    final image = await Navigator.of(context).push<StoredImage>(
      MaterialPageRoute(builder: (_) => const ImageLibraryScreen(insertMode: true)),
    );
    if (image == null) return;
    final md = ImageStore.instance.markdownInsert(image);
    final sel = _controller.selection;
    final text = _controller.text;
    final start = sel.start >= 0 ? sel.start : text.length;
    final end = sel.end >= 0 ? sel.end : text.length;
    final next = text.replaceRange(start, end, md);
    _controller.value = TextEditingValue(
      text: next,
      selection: TextSelection.collapsed(offset: start + md.length),
    );
    _onText(next);
  }

  Future<void> _moveFolder() async {
    final note = _store.byId(widget.noteId);
    if (note == null) return;
    final controller = TextEditingController(text: note.folder ?? '');
    final folder = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('移动到文件夹'),
        content: TextField(
          controller: controller,
          decoration: const InputDecoration(hintText: '留空表示根目录'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('确定')),
        ],
      ),
    );
    if (folder == null) return;
    await _store.setFolder(widget.noteId, folder.isEmpty ? null : normalizeFolder(folder));
    widget.onChanged?.call();
    setState(() {});
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
            padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 4),
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
                  tooltip: '朗读',
                  onPressed: _toggleTts,
                  icon: Icon(_ttsOn ? Icons.stop_circle_outlined : Icons.record_voice_over_outlined),
                ),
                IconButton(
                  tooltip: '插入图片',
                  onPressed: _insertImage,
                  icon: const Icon(Icons.image_outlined),
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
                PopupMenuButton<String>(
                  onSelected: (v) async {
                    switch (v) {
                      case 'export':
                        await _export();
                      case 'publish':
                        await _publish();
                      case 'folder':
                        await _moveFolder();
                      case 'star':
                        await _store.toggleStar(widget.noteId);
                        widget.onChanged?.call();
                        setState(() {});
                      case 'trash':
                        await _trash();
                    }
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'export', child: Text('导出…')),
                    const PopupMenuItem(value: 'publish', child: Text('发布到博客')),
                    const PopupMenuItem(value: 'folder', child: Text('移动到文件夹')),
                    PopupMenuItem(
                      value: 'star',
                      child: Text(note.starred ? '取消星标' : '加星标'),
                    ),
                    const PopupMenuItem(value: 'trash', child: Text('移到回收站')),
                  ],
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
