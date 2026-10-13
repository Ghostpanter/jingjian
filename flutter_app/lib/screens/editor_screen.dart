import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../models/note.dart';
import '../services/backlinks.dart';
import '../services/blog_service.dart';
import '../services/export_service.dart';
import '../services/folder_tree.dart';
import '../services/image_store.dart';
import '../services/note_store.dart';
import '../services/note_text.dart';
import '../services/tts_service.dart';
import '../services/wiki_links.dart';
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
    this.onOpenNote,
    this.autoSpeak = false,
  });

  final String noteId;
  final bool embedded;
  final VoidCallback? onChanged;

  /// Open another note (wiki link / chapter nav). Defaults to replacing route.
  final void Function(String id, {bool speak})? onOpenNote;
  final bool autoSpeak;

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

class _EditorScreenState extends State<EditorScreen> {
  final _store = NoteStore.instance;
  late final TextEditingController _controller;
  late final FocusNode _focus;
  final _findCtl = TextEditingController();
  final _replaceCtl = TextEditingController();
  final _findFocus = FocusNode();
  Timer? _debounce;
  StreamSubscription<void>? _ttsSub;
  _Pane _pane = _Pane.split;
  bool _ttsOn = false;
  bool _findOpen = false;
  bool _replaceOpen = false;
  bool _findCase = false;
  bool _findRegex = false;
  int _findIndex = 0;
  bool _formatBar = true;

  @override
  void initState() {
    super.initState();
    final note = _store.byId(widget.noteId);
    _controller = TextEditingController(text: note?.content ?? '');
    _focus = FocusNode();
    _ttsSub = TtsService.instance.onComplete.listen((_) => _onSpeakDone());
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final narrow = MediaQuery.sizeOf(context).width < 720;
      if (!widget.embedded && narrow) {
        setState(() => _pane = (note?.bookId != null) ? _Pane.preview : _Pane.edit);
      }
      final n = _store.byId(widget.noteId);
      if (n != null) {
        _store.update(n.copyWith(openedAt: DateTime.now().millisecondsSinceEpoch));
      }
      if (widget.autoSpeak) _toggleTts();
    });
  }

  @override
  void dispose() {
    _flush();
    _ttsSub?.cancel();
    _controller.dispose();
    _focus.dispose();
    _findCtl.dispose();
    _replaceCtl.dispose();
    _findFocus.dispose();
    if (_ttsOn) TtsService.instance.stop();
    super.dispose();
  }

  Note? get _note => _store.byId(widget.noteId);

  void _flush() {
    if (_debounce?.isActive ?? false) {
      _debounce!.cancel();
      _save(_controller.text);
    }
  }

  Future<void> _save(String value) async {
    final note = _store.byId(widget.noteId);
    if (note == null || note.content == value) return;
    await _store.update(note.copyWith(content: value, updatedAt: DateTime.now().millisecondsSinceEpoch));
    widget.onChanged?.call();
  }

  void _onText(String value) {
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 280), () async {
      await _save(value);
      if (mounted) setState(() {});
    });
    setState(() {});
  }

  void _setValue(TextEditingValue v) {
    _controller.value = v;
    _onText(v.text);
  }

  void _markup(String kind) {
    if (_pane == _Pane.preview) setState(() => _pane = _Pane.edit);
    _setValue(applyMarkup(_controller.value, kind));
    _focus.requestFocus();
  }

  void _snack(String msg) {
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  // ---------- navigation ----------

  void _open(String id, {bool speak = false}) {
    _flush();
    if (widget.onOpenNote != null) {
      widget.onOpenNote!(id, speak: speak);
      return;
    }
    Navigator.of(context).pushReplacement(MaterialPageRoute(
      builder: (_) => EditorScreen(noteId: id, onChanged: widget.onChanged, autoSpeak: speak),
    ));
  }

  Future<void> _openWiki(String target) async {
    final all = _store.notes;
    final idx = titleIndex([for (final n in all) (id: n.id, content: n.content)]);
    final id = idx[target.trim().toLowerCase()];
    if (id != null) {
      _open(id);
      return;
    }
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('笔记不存在'),
        content: Text('创建「$target」？'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('创建')),
        ],
      ),
    );
    if (ok != true) return;
    final n = await _store.create(content: '# $target\n\n', folder: _note?.folder);
    widget.onChanged?.call();
    _open(n.id);
  }

  List<Note> get _chapters {
    final book = _note?.bookId;
    if (book == null) return const [];
    return _store.notes.where((n) => n.bookId == book).toList()
      ..sort((a, b) => (a.chapterIndex ?? 0).compareTo(b.chapterIndex ?? 0));
  }

  Note? _sibling(int delta) {
    final list = _chapters;
    final i = list.indexWhere((n) => n.id == widget.noteId);
    if (i < 0) return null;
    final j = i + delta;
    return j >= 0 && j < list.length ? list[j] : null;
  }

  void _onSpeakDone() {
    if (!mounted || !_ttsOn) return;
    setState(() => _ttsOn = false);
    final next = _sibling(1);
    if (TtsService.instance.autoNext && next != null) _open(next.id, speak: true);
  }

  Future<void> _splitChapter() async {
    final note = _note;
    if (note == null) return;
    final pos = _controller.selection.isValid ? _controller.selection.start : -1;
    if (pos <= 0 || pos >= _controller.text.length) {
      _snack('请先在源码中把光标放到拆分位置');
      return;
    }
    final head = _controller.text.substring(0, pos).trimRight();
    final tail = _controller.text.substring(pos).trimLeft();
    _debounce?.cancel();
    final now = DateTime.now().millisecondsSinceEpoch;
    final idx = note.chapterIndex ?? 0;
    for (final c in _chapters) {
      if ((c.chapterIndex ?? 0) > idx) await _store.update(c.copyWith(chapterIndex: (c.chapterIndex ?? 0) + 1));
    }
    await _store.update(note.copyWith(content: head, updatedAt: now));
    _controller.text = head;
    final created = await _store.create(content: tail, folder: note.folder);
    await _store.update(created.copyWith(
      bookId: note.bookId,
      bookTitle: note.bookTitle,
      bookAuthor: note.bookAuthor,
      bookCover: note.bookCover,
      chapterIndex: idx + 1,
    ));
    widget.onChanged?.call();
    setState(() {});
    _snack('已拆分为新章节');
  }

  Future<void> _mergeNext() async {
    final note = _note;
    final next = _sibling(1) ?? (note?.bookId == null ? null : null);
    if (note == null || next == null) {
      _snack('没有下一章可合并');
      return;
    }
    _debounce?.cancel();
    final merged = '${_controller.text.trimRight()}\n\n${next.content.trimLeft()}';
    await _store.update(note.copyWith(content: merged, updatedAt: DateTime.now().millisecondsSinceEpoch));
    await _store.moveToTrash(next.id);
    _controller.text = merged;
    widget.onChanged?.call();
    setState(() {});
    _snack('已合并下一章（原章节移入回收站）');
  }

  // ---------- actions ----------

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
    _debounce?.cancel();
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
      setState(() => _ttsOn = false);
      await TtsService.instance.stop();
      return;
    }
    setState(() => _ttsOn = true);
    final ok = await TtsService.instance.speak(_controller.text);
    if (!ok && mounted) {
      setState(() => _ttsOn = false);
      _snack('无法朗读：系统未提供可用的语音引擎或内容为空');
    }
  }

  Future<void> _export() async {
    final note = _note;
    if (note == null) return;
    _flush();
    final chapters = _chapters;
    final format = await showModalBottomSheet<(ExportFormat, bool)>(
      context: context,
      builder: (ctx) => SafeArea(
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final f in ExportFormat.values)
                ListTile(
                  title: Text(exportFormatLabels[f]!),
                  onTap: () => Navigator.pop(ctx, (f, false)),
                ),
              if (chapters.length > 1) ...[
                const Divider(),
                ListTile(
                  leading: const Icon(Icons.menu_book_outlined),
                  title: Text('整本书导出为 EPUB（${chapters.length} 章）'),
                  onTap: () => Navigator.pop(ctx, (ExportFormat.epub, true)),
                ),
              ],
            ],
          ),
        ),
      ),
    );
    if (format == null) return;
    try {
      final whole = format.$2;
      final path = await ExportService.instance.export(
        whole ? chapters : [note],
        format.$1,
        title: whole ? (note.bookTitle ?? note.title) : null,
      );
      if (path != null) _snack('已导出到 $path');
    } catch (e) {
      _snack('导出失败：${e.toString().replaceFirst('Exception: ', '')}');
    }
  }

  Future<void> _print() async {
    final note = _note;
    if (note == null) return;
    _flush();
    try {
      await ExportService.instance.printNotes([note]);
    } catch (e) {
      _snack('打印失败：${e.toString().replaceFirst('Exception: ', '')}');
    }
  }

  Future<void> _publish() async {
    final note = _note;
    if (note == null) return;
    _flush();
    try {
      final path = await BlogService.instance.publish(note);
      _snack('已发布到 $path');
    } catch (e) {
      _snack(e.toString().replaceFirst('Exception: ', ''));
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
    final start = sel.isValid ? sel.start : text.length;
    final end = sel.isValid ? sel.end : text.length;
    _setValue(TextEditingValue(
      text: text.replaceRange(start, end, md),
      selection: TextSelection.collapsed(offset: start + md.length),
    ));
  }

  Future<void> _moveFolder() async {
    final note = _note;
    if (note == null) return;
    final controller = TextEditingController(text: note.folder ?? '');
    final folder = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('移动到文件夹'),
        content: TextField(
          controller: controller,
          autofocus: true,
          decoration: const InputDecoration(hintText: '留空表示根目录，用 / 分隔子文件夹'),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          TextButton(onPressed: () => Navigator.pop(ctx, controller.text.trim()), child: const Text('确定')),
        ],
      ),
    );
    controller.dispose();
    if (folder == null) return;
    await _store.setFolder(widget.noteId, folder.isEmpty ? null : normalizeFolder(folder));
    widget.onChanged?.call();
    setState(() {});
  }

  void _jumpTo(int offset) {
    if (_pane == _Pane.preview) setState(() => _pane = _Pane.edit);
    final o = offset.clamp(0, _controller.text.length);
    _controller.selection = TextSelection.collapsed(offset: o);
    _focus.requestFocus();
  }

  Future<void> _outline() async {
    final hs = extractHeadings(_controller.text);
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * .7),
          child: hs.isEmpty
              ? const Padding(padding: EdgeInsets.all(24), child: Text('没有标题。用 # 开头的行会出现在大纲里。'))
              : ListView(
                  shrinkWrap: true,
                  children: [
                    const ListTile(title: Text('大纲', style: TextStyle(fontWeight: FontWeight.w600))),
                    for (final h in hs)
                      ListTile(
                        dense: true,
                        contentPadding: EdgeInsets.only(left: 16.0 + (h.level - 1) * 16, right: 16),
                        title: Text(h.text, maxLines: 1, overflow: TextOverflow.ellipsis),
                        onTap: () {
                          Navigator.pop(ctx);
                          _jumpTo(h.offset);
                        },
                      ),
                  ],
                ),
        ),
      ),
    );
  }

  Future<void> _links() async {
    final note = _note;
    if (note == null) return;
    _flush();
    final l = linksFor(note.copyWith(content: _controller.text), _store.notes);
    Widget section(String title, int count) => Padding(
          padding: const EdgeInsets.fromLTRB(16, 14, 16, 4),
          child: Text('$title（$count）', style: TextStyle(fontWeight: FontWeight.w600, color: JingjianColors.muted)),
        );
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: MediaQuery.sizeOf(ctx).height * .75),
          child: ListView(
            shrinkWrap: true,
            children: [
              section('反向链接', l.backlinks.length),
              for (final r in l.backlinks)
                ListTile(
                  dense: true,
                  title: Text(r.note.title),
                  subtitle: Text(r.snippet, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () {
                    Navigator.pop(ctx);
                    _open(r.note.id);
                  },
                ),
              section('链出', l.outgoing.length + l.missing.length),
              for (final n in l.outgoing)
                ListTile(
                  dense: true,
                  leading: const Icon(Icons.north_east, size: 18),
                  title: Text(n.title),
                  onTap: () {
                    Navigator.pop(ctx);
                    _open(n.id);
                  },
                ),
              for (final m in l.missing)
                ListTile(
                  dense: true,
                  leading: Icon(Icons.add, size: 18, color: JingjianColors.muted),
                  title: Text(m, style: TextStyle(color: JingjianColors.muted)),
                  subtitle: const Text('尚未创建，点按创建'),
                  onTap: () {
                    Navigator.pop(ctx);
                    _openWiki(m);
                  },
                ),
              section('未链接的提及', l.mentions.length),
              for (final r in l.mentions)
                ListTile(
                  dense: true,
                  title: Text(r.note.title),
                  subtitle: Text(r.snippet, maxLines: 1, overflow: TextOverflow.ellipsis),
                  onTap: () {
                    Navigator.pop(ctx);
                    _open(r.note.id);
                  },
                ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  void _showCount() {
    final c = countText(_controller.text);
    final note = _note;
    String fmt(int? ms) => ms == null ? '—' : isoLocal(DateTime.fromMillisecondsSinceEpoch(ms)).replaceFirst('T', ' ').substring(0, 16);
    showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('字数统计'),
        content: Text('字符（不含空白）：${c.chars}\n字/词：${c.words}\n行数：${c.lines}\n'
            '预计阅读：约 ${(c.words / 400).ceil()} 分钟\n\n'
            '创建：${fmt(note?.createdAt)}\n修改：${fmt(note?.updatedAt)}'),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('好'))],
      ),
    );
  }

  // ---------- find / replace ----------

  List<TextRange> get _matches =>
      findAll(_controller.text, _findCtl.text, caseSensitive: _findCase, regex: _findRegex);

  void _openFind({bool replace = false}) {
    final sel = _controller.selection;
    if (sel.isValid && !sel.isCollapsed && sel.end - sel.start < 200) {
      _findCtl.text = sel.textInside(_controller.text);
    }
    setState(() {
      _findOpen = true;
      _replaceOpen = replace || _replaceOpen;
      if (_pane == _Pane.preview) _pane = _Pane.edit;
    });
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _findFocus.requestFocus();
      _findCtl.selection = TextSelection(baseOffset: 0, extentOffset: _findCtl.text.length);
    });
  }

  void _closeFind() {
    setState(() => _findOpen = false);
    _focus.requestFocus();
  }

  void _findStep(int delta) {
    final ms = _matches;
    if (ms.isEmpty) {
      setState(() {});
      return;
    }
    final cur = _controller.selection.isValid ? _controller.selection.start : 0;
    int i;
    if (delta > 0) {
      i = ms.indexWhere((m) => m.start > cur || (m.start == cur && _controller.selection.isCollapsed));
      if (i < 0) i = 0;
    } else {
      i = ms.lastIndexWhere((m) => m.start < cur);
      if (i < 0) i = ms.length - 1;
    }
    _findIndex = i;
    _controller.selection = TextSelection(baseOffset: ms[i].start, extentOffset: ms[i].end);
    setState(() {});
  }

  void _replaceOne() {
    final ms = _matches;
    if (ms.isEmpty) return;
    final sel = _controller.selection;
    final hit = ms.where((m) => sel.isValid && m.start == sel.start && m.end == sel.end).firstOrNull;
    if (hit == null) {
      _findStep(1);
      return;
    }
    final piece = hit.textInside(_controller.text);
    final rep = _findRegex
        ? replaceAllMatches(piece, _findCtl.text, _replaceCtl.text, caseSensitive: _findCase, regex: true)
        : _replaceCtl.text;
    final text = _controller.text.replaceRange(hit.start, hit.end, rep);
    _setValue(TextEditingValue(text: text, selection: TextSelection.collapsed(offset: hit.start + rep.length)));
    _findStep(1);
  }

  void _replaceAll() {
    final n = _matches.length;
    if (n == 0) return;
    final text = replaceAllMatches(_controller.text, _findCtl.text, _replaceCtl.text,
        caseSensitive: _findCase, regex: _findRegex);
    _setValue(TextEditingValue(text: text, selection: const TextSelection.collapsed(offset: 0)));
    _snack('已替换 $n 处');
  }

  Widget _findBar() {
    final ms = _matches;
    final pos = ms.isEmpty ? 0 : (_findIndex.clamp(0, ms.length - 1) + 1);
    return Material(
      color: JingjianColors.surface,
      child: Padding(
        padding: const EdgeInsets.fromLTRB(8, 4, 4, 4),
        child: Column(
          children: [
            Row(children: [
              Expanded(
                child: TextField(
                  controller: _findCtl,
                  focusNode: _findFocus,
                  decoration: InputDecoration(
                    isDense: true,
                    hintText: '查找',
                    border: InputBorder.none,
                    suffixText: _findCtl.text.isEmpty ? null : '$pos/${ms.length}',
                  ),
                  onChanged: (_) => setState(() => _findIndex = 0),
                  onSubmitted: (_) {
                    _findStep(1);
                    _findFocus.requestFocus();
                  },
                ),
              ),
              IconButton(
                tooltip: '区分大小写',
                isSelected: _findCase,
                onPressed: () => setState(() => _findCase = !_findCase),
                icon: const Text('Aa'),
              ),
              IconButton(
                tooltip: '正则表达式',
                isSelected: _findRegex,
                onPressed: () => setState(() => _findRegex = !_findRegex),
                icon: const Text('.*'),
              ),
              IconButton(tooltip: '上一个', onPressed: () => _findStep(-1), icon: const Icon(Icons.keyboard_arrow_up)),
              IconButton(tooltip: '下一个', onPressed: () => _findStep(1), icon: const Icon(Icons.keyboard_arrow_down)),
              IconButton(
                tooltip: '替换',
                isSelected: _replaceOpen,
                onPressed: () => setState(() => _replaceOpen = !_replaceOpen),
                icon: const Icon(Icons.find_replace),
              ),
              IconButton(tooltip: '关闭', onPressed: _closeFind, icon: const Icon(Icons.close)),
            ]),
            if (_replaceOpen)
              Row(children: [
                Expanded(
                  child: TextField(
                    controller: _replaceCtl,
                    decoration: const InputDecoration(isDense: true, hintText: '替换为（正则可用 \$1）', border: InputBorder.none),
                    onSubmitted: (_) => _replaceOne(),
                  ),
                ),
                TextButton(onPressed: _replaceOne, child: const Text('替换')),
                TextButton(onPressed: _replaceAll, child: const Text('全部替换')),
              ]),
          ],
        ),
      ),
    );
  }

  Widget _formatButtons() {
    Widget b(String kind, String tip, Widget icon) => IconButton(
          tooltip: tip,
          visualDensity: VisualDensity.compact,
          onPressed: () => _markup(kind),
          icon: icon,
        );
    Widget t(String s, {FontWeight? w, FontStyle? st, TextDecoration? d}) =>
        Text(s, style: TextStyle(fontWeight: w, fontStyle: st, decoration: d, fontSize: 15));
    return Container(
      height: 42,
      decoration: BoxDecoration(
        color: JingjianColors.surface,
        border: Border(bottom: BorderSide(color: JingjianColors.border)),
      ),
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 4),
        children: [
          b('bold', '粗体 Ctrl+B', t('B', w: FontWeight.w800)),
          b('italic', '斜体 Ctrl+I', t('I', st: FontStyle.italic)),
          b('strike', '删除线', t('S', d: TextDecoration.lineThrough)),
          b('code', '行内代码', const Icon(Icons.code, size: 20)),
          b('h1', '一级标题', t('H1')),
          b('h2', '二级标题', t('H2')),
          b('h3', '三级标题', t('H3')),
          b('ul', '无序列表', const Icon(Icons.format_list_bulleted, size: 20)),
          b('ol', '有序列表', const Icon(Icons.format_list_numbered, size: 20)),
          b('task', '待办', const Icon(Icons.check_box_outlined, size: 20)),
          b('quote', '引用', const Icon(Icons.format_quote, size: 20)),
          b('link', '链接 Ctrl+K', const Icon(Icons.link, size: 20)),
          b('wiki', '双链 [[ ]]', t('[[ ]]')),
          IconButton(
            tooltip: '插入图片',
            visualDensity: VisualDensity.compact,
            onPressed: _insertImage,
            icon: const Icon(Icons.image_outlined, size: 20),
          ),
          b('table', '表格', const Icon(Icons.table_chart_outlined, size: 20)),
          b('math', '公式', t('∑')),
          b('mermaid', 'Mermaid 图', const Icon(Icons.account_tree_outlined, size: 20)),
          b('hr', '分割线', const Icon(Icons.horizontal_rule, size: 20)),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final note = _note;
    if (note == null) {
      return const Scaffold(body: Center(child: Text('笔记不存在')));
    }
    final theme = ThemeController.instance;
    final chapters = _chapters;
    final prev = _sibling(-1), next = _sibling(1);

    final editor = Container(
      color: JingjianColors.paper,
      child: TextField(
        controller: _controller,
        focusNode: _focus,
        maxLines: null,
        expands: true,
        keyboardType: TextInputType.multiline,
        textAlignVertical: TextAlignVertical.top,
        style: TextStyle(
          fontSize: theme.fontSize,
          height: 1.7,
          color: JingjianColors.ink,
          fontFamily: theme.fontFamily,
        ),
        cursorColor: JingjianColors.accent,
        decoration: const InputDecoration(
          filled: false,
          contentPadding: EdgeInsets.fromLTRB(16, 12, 16, 24),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
        onChanged: _onText,
      ),
    );

    final preview = MarkdownPreview(
      content: _controller.text,
      plain: note.format == NoteFormat.txt,
      onWikiTap: _openWiki,
    );

    Widget body;
    switch (_pane) {
      case _Pane.edit:
        body = editor;
      case _Pane.preview:
        body = preview;
      case _Pane.split:
        body = LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 640) {
              return Column(children: [
                Expanded(child: editor),
                Divider(height: 1, color: JingjianColors.border),
                Expanded(child: preview),
              ]);
            }
            return Row(children: [
              Expanded(child: editor),
              VerticalDivider(width: 1, color: JingjianColors.border),
              Expanded(child: preview),
            ]);
          },
        );
    }

    final count = countText(_controller.text);
    final content = Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: JingjianColors.surface,
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
                  child: Padding(
                    padding: EdgeInsets.only(left: widget.embedded ? 12 : 0),
                    child: Text(
                      note.title,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16),
                    ),
                  ),
                ),
                IconButton(
                  tooltip: '朗读',
                  onPressed: _toggleTts,
                  icon: Icon(_ttsOn ? Icons.stop_circle_outlined : Icons.record_voice_over_outlined),
                ),
                IconButton(
                  tooltip: '查找 Ctrl+F',
                  onPressed: () => _findOpen ? _closeFind() : _openFind(),
                  icon: const Icon(Icons.search),
                ),
                IconButton(
                  tooltip: '源码 / 分栏 / 预览（Ctrl+E）',
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
                      case 'outline':
                        await _outline();
                      case 'links':
                        await _links();
                      case 'count':
                        _showCount();
                      case 'format':
                        setState(() => _formatBar = !_formatBar);
                      case 'replace':
                        _openFind(replace: true);
                      case 'export':
                        await _export();
                      case 'print':
                        await _print();
                      case 'publish':
                        await _publish();
                      case 'folder':
                        await _moveFolder();
                      case 'plain':
                        await _store.update(note.copyWith(
                            format: note.format == NoteFormat.txt ? NoteFormat.markdown : NoteFormat.txt));
                        widget.onChanged?.call();
                        setState(() {});
                      case 'star':
                        await _store.toggleStar(widget.noteId);
                        widget.onChanged?.call();
                        setState(() {});
                      case 'split':
                        await _splitChapter();
                      case 'merge':
                        await _mergeNext();
                      case 'trash':
                        await _trash();
                    }
                  },
                  itemBuilder: (_) => [
                    const PopupMenuItem(value: 'outline', child: Text('大纲')),
                    const PopupMenuItem(value: 'links', child: Text('双链 / 反向链接')),
                    const PopupMenuItem(value: 'count', child: Text('字数统计')),
                    const PopupMenuItem(value: 'replace', child: Text('查找替换')),
                    CheckedPopupMenuItem(value: 'format', checked: _formatBar, child: const Text('格式工具栏')),
                    CheckedPopupMenuItem(
                        value: 'plain', checked: note.format == NoteFormat.txt, child: const Text('纯文本笔记')),
                    const PopupMenuDivider(),
                    const PopupMenuItem(value: 'export', child: Text('导出…')),
                    const PopupMenuItem(value: 'print', child: Text('打印 / 存为 PDF')),
                    const PopupMenuItem(value: 'publish', child: Text('发布到博客')),
                    const PopupMenuItem(value: 'folder', child: Text('移动到文件夹')),
                    PopupMenuItem(value: 'star', child: Text(note.starred ? '取消星标' : '加星标')),
                    const PopupMenuItem(value: 'split', child: Text('在光标处拆分章节')),
                    if (next != null) const PopupMenuItem(value: 'merge', child: Text('与下一章合并')),
                    const PopupMenuDivider(),
                    const PopupMenuItem(value: 'trash', child: Text('移到回收站')),
                  ],
                ),
              ],
            ),
          ),
        ),
        Divider(height: 1, color: JingjianColors.border),
        if (_findOpen) ...[_findBar(), Divider(height: 1, color: JingjianColors.border)],
        if (_formatBar && _pane != _Pane.preview && note.format != NoteFormat.txt) _formatButtons(),
        Expanded(child: body),
        Container(
          decoration: BoxDecoration(
            color: JingjianColors.surface,
            border: Border(top: BorderSide(color: JingjianColors.border)),
          ),
          padding: const EdgeInsets.symmetric(horizontal: 8),
          height: 34,
          child: Row(
            children: [
              if (chapters.length > 1) ...[
                IconButton(
                  tooltip: '上一章',
                  visualDensity: VisualDensity.compact,
                  iconSize: 18,
                  onPressed: prev == null ? null : () => _open(prev.id),
                  icon: const Icon(Icons.chevron_left),
                ),
                Text('${(note.chapterIndex ?? 0) + 1}/${chapters.length}',
                    style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
                IconButton(
                  tooltip: '下一章',
                  visualDensity: VisualDensity.compact,
                  iconSize: 18,
                  onPressed: next == null ? null : () => _open(next.id),
                  icon: const Icon(Icons.chevron_right),
                ),
              ],
              const Spacer(),
              InkWell(
                onTap: _showCount,
                child: Text('${count.chars} 字 · ${count.lines} 行',
                    style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
              ),
            ],
          ),
        ),
      ],
    );

    final shortcuts = CallbackShortcuts(
      bindings: {
        const SingleActivator(LogicalKeyboardKey.keyB, control: true): () => _markup('bold'),
        const SingleActivator(LogicalKeyboardKey.keyB, meta: true): () => _markup('bold'),
        const SingleActivator(LogicalKeyboardKey.keyI, control: true): () => _markup('italic'),
        const SingleActivator(LogicalKeyboardKey.keyI, meta: true): () => _markup('italic'),
        const SingleActivator(LogicalKeyboardKey.keyK, control: true): () => _markup('link'),
        const SingleActivator(LogicalKeyboardKey.keyK, meta: true): () => _markup('link'),
        const SingleActivator(LogicalKeyboardKey.keyF, control: true): _openFind,
        const SingleActivator(LogicalKeyboardKey.keyF, meta: true): _openFind,
        const SingleActivator(LogicalKeyboardKey.keyH, control: true): () => _openFind(replace: true),
        const SingleActivator(LogicalKeyboardKey.keyE, control: true): _cyclePane,
        const SingleActivator(LogicalKeyboardKey.keyE, meta: true): _cyclePane,
        const SingleActivator(LogicalKeyboardKey.keyS, control: true): _flush,
        const SingleActivator(LogicalKeyboardKey.keyS, meta: true): _flush,
        const SingleActivator(LogicalKeyboardKey.escape): () {
          if (_findOpen) _closeFind();
        },
      },
      child: Focus(child: content),
    );

    if (widget.embedded) return Material(color: JingjianColors.paper, child: shortcuts);
    return Scaffold(body: SafeArea(child: shortcuts));
  }
}
