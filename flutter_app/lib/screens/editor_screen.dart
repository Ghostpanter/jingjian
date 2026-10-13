import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:http/http.dart' as http;
import 'package:pasteboard/pasteboard.dart';

import '../models/note.dart';
import '../services/app_prefs.dart';
import '../services/backlinks.dart';
import '../services/collab/collab_session.dart';
import '../services/image_upload.dart';
import '../services/publish/blog_platforms.dart';
import '../services/export_service.dart';
import '../services/folder_tree.dart';
import '../services/image_store.dart';
import '../services/note_history.dart';
import '../services/note_store.dart';
import '../services/note_text.dart';
import '../services/tts_service.dart';
import '../services/wiki_links.dart';
import '../theme/app_theme.dart';
import '../widgets/markdown_preview.dart';
import 'image_library_screen.dart';
import '../widgets/collab_dialog.dart';
import 'blog_platforms_screen.dart';

enum _Pane { edit, split, preview }

class EditorScreen extends StatefulWidget {
  const EditorScreen({
    super.key,
    required this.noteId,
    this.embedded = false,
    this.onChanged,
    this.onOpenNote,
    this.autoSpeak = false,
    this.onFocusMode,
  });

  final String noteId;
  final bool embedded;
  final VoidCallback? onChanged;

  /// Open another note (wiki link / chapter nav). Defaults to replacing route.
  final void Function(String id, {bool speak})? onOpenNote;
  final bool autoSpeak;

  /// Embedded editor asks the shell to hide/show its side panes (专注模式).
  final ValueChanged<bool>? onFocusMode;

  @override
  State<EditorScreen> createState() => _EditorScreenState();
}

const _livePreviewLimit = 20000;
const _webHeavyChars = 150000;

class _EditorScreenState extends State<EditorScreen> with WidgetsBindingObserver {
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
  bool _imageBusy = false;
  bool _focusMode = false;
  DateTime? _menuPickedAt;
  Widget? _previewWidget;
  String _previewWidgetKey = '';
  final _listFormatter = ListContinuationFormatter();
  late final _slashFormatter = SlashTriggerFormatter(() {
    if (_slashPending) return;
    _slashPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) => _slashMenu());
  });
  bool _slashPending = false;
  final _editorScroll = ScrollController();
  final _editorBoxKey = GlobalKey();
  bool _typewriter = false;
  Timer? _twTimer;
  _Pane? _paneBeforeFocus;
  final _bodyKey = GlobalKey(debugLabel: 'editor-body'); // keeps caret when toggling 专注模式

  /// Text shown in the preview. Big notes refresh it on the save debounce
  /// instead of every keystroke, so typing stays smooth in split view.
  String _previewText = '';
  String? _countFor;
  ({int chars, int words, int lines}) _count = (chars: 0, words: 0, lines: 0);
  ({int chars, int words, int lines}) get _liveCount {
    final t = _controller.text;
    if (!identical(t, _countFor)) {
      _countFor = t;
      _count = countText(t);
    }
    return _count;
  }
  final _collab = CollabManager.instance;

  @override
  void initState() {
    super.initState();
    final note = _store.byId(widget.noteId);
    _controller = TextEditingController(text: note?.content ?? '');
    _previewText = _controller.text;
    _focus = FocusNode();
    _ttsSub = TtsService.instance.onComplete.listen((_) => _onSpeakDone());
    _collab.addListener(_onCollab);
    _bindCollab();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final narrow = MediaQuery.sizeOf(context).width < 720;
      if (!widget.embedded && narrow) {
        setState(() => _pane = (note?.bookId != null) ? _Pane.preview : _Pane.edit);
      }
      // Web lays out the whole TextField text on every keystroke; very large
      // notes (≈10k+ lines) take ~1s per key there. Open them in preview.
      if (kIsWeb && (note?.content.length ?? 0) > _webHeavyChars) {
        setState(() => _pane = _Pane.preview);
        _snack('笔记很大（${((note!.content.length) / 1024).round()} KB），网页版先以预览打开；编辑会较慢，建议用「在光标处拆分章节」拆小，或用桌面/手机版');
      }
      final n = _store.byId(widget.noteId);
      if (n != null) {
        _store.update(n.copyWith(openedAt: DateTime.now().millisecondsSinceEpoch));
      }
      if (widget.autoSpeak) _toggleTts();
    });
  }

  void _bindCollab() {
    final s = _collab.session;
    if (s != null && _collab.noteId == widget.noteId && s.state == CollabState.live) {
      s.bind(_controller, onRemoteText: (text) {
        _onText(text);
      });
    }
  }

  void _onCollab() {
    if (!mounted) return;
    final s = _collab.session;
    if (s != null && _collab.noteId == widget.noteId && s.state == CollabState.closed) {
      final err = s.error;
      _collab.end();
      _snack(err ?? '协作已结束');
    }
    final notice = s?.notice;
    if (notice != null && _collab.noteId == widget.noteId) {
      s!.notice = null;
      _snack(notice);
    }
    setState(() {});
  }

  bool get _inCollab => _collab.session != null && _collab.noteId == widget.noteId;

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    // Save pending keystrokes before Android may kill a backgrounded app.
    if (state != AppLifecycleState.resumed) _flush();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _collab.removeListener(_onCollab);
    if (_inCollab) {
      _collab.session?.unbind();
      // Leaving the editor ends the session (host closes the room).
      _collab.end();
    }
    _flush();
    _ttsSub?.cancel();
    _controller.dispose();
    _twTimer?.cancel();
    _editorScroll.dispose();
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
      if (mounted) setState(() => _previewText = _controller.text);
      await _save(value);
      if (mounted) setState(() {});
    });
    setState(() {
      if (value.length < _livePreviewLimit) _previewText = value;
    });
    if (_typewriter) {
      // After EditableText's own "show caret" scroll (≈100 ms), re-centre.
      _twTimer?.cancel();
      _twTimer = Timer(const Duration(milliseconds: 160), _centerCaret);
    }
  }

  /// 打字机模式: keep the caret line vertically centred while typing.
  void _centerCaret() {
    if (!mounted || !_typewriter || !_editorScroll.hasClients) return;
    EditableTextState? ed;
    void visit(Element e) {
      if (ed != null) return;
      if (e is StatefulElement && e.state is EditableTextState) {
        ed = e.state as EditableTextState;
        return;
      }
      e.visitChildren(visit);
    }
    _editorBoxKey.currentContext?.visitChildElements(visit);
    final re = ed?.renderEditable;
    final sel = _controller.selection;
    if (re == null || !re.hasSize || !sel.isValid) return;
    final caret = re.getLocalRectForCaret(TextPosition(offset: sel.extentOffset));
    final pos = _editorScroll.position;
    final target = (pos.pixels + caret.center.dy - re.size.height / 2).clamp(0.0, pos.maxScrollExtent);
    if ((target - pos.pixels).abs() > 4) {
      _editorScroll.animateTo(target, duration: const Duration(milliseconds: 120), curve: Curves.easeOut);
    }
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
    // Replace instead of queueing, so hints never show after they're stale.
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(msg)));
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
    _previewText = head;
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
    _previewText = merged;
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
    final prefs = await readPlatformPrefs();
    final gitOk = AppPrefs.instance.readBlogConfig().isConfigured;
    final enabled = [
      for (final id in PlatformId.values)
        if (prefs.enabled(id, gitOk) && (id == PlatformId.git ? gitOk : prefs.sites[id]!.ready)) id,
    ];
    if (!mounted) return;
    if (enabled.isEmpty) {
      final go = await showDialog<bool>(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('还没有可用的博客平台'),
          content: const Text('先在 设置 → 博客平台 里填写并启用一个平台。'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
            TextButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('去设置')),
          ],
        ),
      );
      if (go == true && mounted) {
        await Navigator.of(context).push(MaterialPageRoute(builder: (_) => const BlogPlatformsScreen()));
      }
      return;
    }
    final chosen = <PlatformId>{
      ...(prefs.defaultsSet ? prefs.defaults.where(enabled.contains) : enabled.take(1)),
    };
    final ids = await showDialog<List<PlatformId>>(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, set) => AlertDialog(
          title: Text('发布「${note.title}」'),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            for (final id in enabled)
              CheckboxListTile(
                dense: true,
                value: chosen.contains(id),
                title: Text(platformLabel(id)),
                subtitle: Text(id == PlatformId.git ? AppPrefs.instance.readBlogConfig().repo : prefs.sites[id]!.site.isNotEmpty ? prefs.sites[id]!.site : prefs.sites[id]!.repo),
                onChanged: (v) => set(() => v == true ? chosen.add(id) : chosen.remove(id)),
              ),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
            FilledButton(
              onPressed: chosen.isEmpty ? null : () => Navigator.pop(ctx, enabled.where(chosen.contains).toList()),
              child: const Text('发布'),
            ),
          ],
        ),
      ),
    );
    if (ids == null || ids.isEmpty) return;
    prefs
      ..defaultsSet = true
      ..defaults = ids;
    await writePlatformPrefs(prefs);
    _snack('发布中…');
    final current = _store.byId(widget.noteId) ?? note;
    final r = await BlogPlatformService.instance.publish(current, ids, prefs);
    if (!mounted) return;
    final lines = [
      for (final o in r.ok) '✓ ${o.label}${o.updated ? '（已更新）' : ''}：${o.detail}',
      for (final f in r.failed) '✗ ${f.$1}：${f.$2}',
    ];
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(r.failed.isEmpty ? '发布完成' : '部分失败'),
        content: SelectableText(lines.join('\n')),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('好'))],
      ),
    );
  }

  Future<void> _collabMenu() async {
    final note = _note;
    if (note == null) return;
    _flush();
    if (_inCollab) {
      final leave = await showCollabInfo(context, _collab.session!);
      if (leave == true) {
        _collab.session?.unbind();
        await _collab.end();
        _snack('已退出协作');
      }
      return;
    }
    if (_collab.session != null) {
      _snack('另一篇笔记正在协作中，请先结束');
      return;
    }
    final s = await showHostDialog(context, text: _controller.text, title: note.title);
    if (s == null || !mounted) return;
    _collab.attach(s, widget.noteId);
    _bindCollab();
    setState(() {});
    await showCollabInfo(context, s);
  }

  void _insertMarkdownAtCursor(String md) {
    final sel = _controller.selection;
    final text = _controller.text;
    final start = sel.isValid ? sel.start : text.length;
    final end = sel.isValid ? sel.end : text.length;
    _setValue(TextEditingValue(
      text: text.replaceRange(start, end, md),
      selection: TextSelection.collapsed(offset: start + md.length),
    ));
  }

  /// Save locally or upload to 图床 per settings, then insert markdown.
  Future<void> _placeImage(Uint8List bytes, String name, {StoredImage? existing}) async {
    if (_imageBusy) return;
    setState(() => _imageBusy = true);
    try {
      final cfg = await readImageConfig();
      if (cfg.uploads && cfg.applyToLocal) _snack('正在上传到${imageUploaderLabels[cfg.uploader]}…');
      final r = await resolveInsertedImage(bytes, name, config: cfg, existing: existing);
      final alt = name.replaceFirst(RegExp(r'\.[^.]+$'), '');
      _insertMarkdownAtCursor('![${alt.isEmpty ? 'image' : alt}](${r.src})');
      if (r.uploaded) _snack('已上传并插入');
    } catch (e) {
      final msg = e.toString().replaceFirst('Exception: ', '');
      // Upload failed → keep the image locally so nothing is lost.
      if (existing == null) {
        final stored = await ImageStore.instance.saveBytes(bytes, name);
        _insertMarkdownAtCursor(ImageStore.instance.markdownInsert(stored));
        _snack('上传失败（$msg），已保存在本机');
      } else {
        _insertMarkdownAtCursor(ImageStore.instance.markdownInsert(existing));
        _snack('上传失败（$msg），已插入本机图片');
      }
    } finally {
      if (mounted) setState(() => _imageBusy = false);
    }
  }

  Future<void> _insertImage() async {
    final image = await Navigator.of(context).push<StoredImage>(
      MaterialPageRoute(builder: (_) => const ImageLibraryScreen(insertMode: true)),
    );
    if (image == null) return;
    final cfg = await readImageConfig();
    if (!(cfg.uploads && cfg.applyToLocal)) {
      _insertMarkdownAtCursor('![${image.id}](${formatImageSrc(image.path, cfg)})');
      return;
    }
    final img = ImageStore.instance.imageSync(image.id);
    if (img == null) {
      _insertMarkdownAtCursor(ImageStore.instance.markdownInsert(image));
      return;
    }
    await _placeImage(img.bytes, img.name, existing: image);
  }

  static final _imageUrl = RegExp(r'^https?://\S+\.(png|jpe?g|gif|webp|bmp)(\?\S*)?$', caseSensitive: false);

  /// Paste: clipboard image → insert image; image URL → download if enabled;
  /// otherwise normal text paste. Returns true if handled as image.
  Future<bool> _pasteImage({bool fallbackText = false}) async {
    Uint8List? img;
    try {
      img = await Pasteboard.image;
    } catch (_) {}
    if (img != null && img.isNotEmpty) {
      await _placeImage(img, 'paste-${DateTime.now().millisecondsSinceEpoch}.${sniffImageMime(img) == 'image/jpeg' ? 'jpg' : 'png'}');
      return true;
    }
    final text = (await Clipboard.getData(Clipboard.kTextPlain))?.text ?? '';
    final cfg = await readImageConfig();
    if (_imageUrl.hasMatch(text.trim()) && cfg.applyToRemote && cfg.insertAction != ImageInsertAction.none) {
      try {
        final res = await http.get(Uri.parse(text.trim())).timeout(const Duration(seconds: 20));
        if (res.statusCode == 200 && (res.headers['content-type'] ?? '').startsWith('image/')) {
          await _placeImage(res.bodyBytes, Uri.parse(text.trim()).pathSegments.lastOrNull ?? 'image.jpg');
          return true;
        }
      } catch (_) {}
    }
    if (fallbackText && text.isNotEmpty) {
      _insertMarkdownAtCursor(text);
    } else if (!fallbackText) {
      _snack('剪贴板里没有图片');
    }
    return false;
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

  void _toggleFocusMode() {
    setState(() => _focusMode = !_focusMode);
    widget.onFocusMode?.call(_focusMode);
    if (_focusMode) {
      _paneBeforeFocus = _pane;
      if (_pane == _Pane.split) setState(() => _pane = _Pane.edit);
    } else if (_paneBeforeFocus != null) {
      setState(() => _pane = _paneBeforeFocus!);
      _paneBeforeFocus = null;
    }
    if (_focusMode) {
      _snack('专注模式：按 Esc 或 F11 退出');
    } else {
      ScaffoldMessenger.maybeOf(context)?.hideCurrentSnackBar();
    }
    // The layout changes around the editor; put the caret back.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _pane != _Pane.preview) _focus.requestFocus();
    });
  }

  String _ago(int t) {
    final d = DateTime.now().difference(DateTime.fromMillisecondsSinceEpoch(t));
    if (d.inMinutes < 1) return '刚刚';
    if (d.inHours < 1) return '${d.inMinutes} 分钟前';
    if (d.inDays < 1) return '${d.inHours} 小时前';
    final dt = DateTime.fromMillisecondsSinceEpoch(t);
    return '${dateStamp(dt)} ${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }

  Future<void> _history() async {
    _flush();
    final versions = NoteHistory.instance.versions(NoteStore.keyFor(widget.noteId));
    const reasons = {'auto': '自动', 'sync': '同步前', 'restore': '恢复前', 'replace': '替换前'};
    final pick = await showDialog<NoteVersion>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('历史版本'),
        content: SizedBox(
          width: 420,
          child: versions.isEmpty
              ? const Text('还没有历史版本。编辑超过 10 分钟、同步覆盖或全部替换前，会自动保存旧版本（仅存本机）。')
              : ListView.builder(
                  shrinkWrap: true,
                  itemCount: versions.length,
                  itemBuilder: (_, i) {
                    final v = versions[i];
                    final c = countText(v.content);
                    final first = v.content.trim().split('\n').first;
                    return ListTile(
                      dense: true,
                      title: Text('${_ago(v.time)} · ${reasons[v.reason] ?? v.reason}'),
                      subtitle: Text('${c.chars} 字 · $first', maxLines: 1, overflow: TextOverflow.ellipsis),
                      onTap: () => Navigator.pop(ctx, v),
                    );
                  },
                ),
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('关闭'))],
      ),
    );
    if (pick == null || !mounted) return;
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text('恢复到 ${_ago(pick.time)} 的版本？'),
        content: SizedBox(
          width: 520,
          height: 360,
          child: SingleChildScrollView(child: SelectableText(pick.content, style: const TextStyle(fontSize: 13))),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('取消')),
          FilledButton(onPressed: () => Navigator.pop(ctx, true), child: const Text('恢复（当前内容会存为历史）')),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final note = _note;
    if (note == null) return;
    _debounce?.cancel();
    await _store.update(note.copyWith(content: pick.content, updatedAt: DateTime.now().millisecondsSinceEpoch),
        historyReason: 'restore');
    _controller.text = pick.content;
    _previewText = pick.content;
    widget.onChanged?.call();
    setState(() {});
    _snack('已恢复历史版本');
  }

  /// "/" on an empty line: pick a block to insert; the "/" is replaced.
  /// Esc keeps the "/" as typed.
  Future<void> _slashMenu() async {
    try {
      if (!mounted || _note == null) return;
      final cmds = <(String, String, VoidCallback)>[
        for (final it in slashItems) (it.$1, it.$2, () => _applySlash(it.$3)),
      ];
      final picked = await showDialog<VoidCallback>(
        context: context,
        builder: (ctx) => _CommandPalette(commands: cmds, hint: '插入…（输入筛选，Esc 保留 /）'),
      );
      _menuPickedAt = DateTime.now();
      if (!mounted) return;
      if (picked != null) picked();
      _focus.requestFocus();
    } finally {
      _slashPending = false;
    }
  }

  void _applySlash(String kind) {
    final v = _controller.value;
    final at = v.selection.isValid ? v.selection.baseOffset : -1;
    if (at >= 1 && at <= v.text.length && v.text[at - 1] == '/') {
      _controller.value = TextEditingValue(
        text: v.text.replaceRange(at - 1, at, ''),
        selection: TextSelection.collapsed(offset: at - 1),
      );
    }
    _markup(kind);
  }

  Future<void> _commandPalette() async {
    final note = _note;
    if (note == null) return;
    final cmds = <(String, String, VoidCallback)>[
      ('大纲', '', () => _outline()),
      ('双链 / 反向链接', '', () => _links()),
      ('历史版本', '', () => _history()),
      ('字数统计', '', _showCount),
      ('查找', 'Ctrl+F', () => _openFind()),
      ('查找替换', 'Ctrl+H', () => _openFind(replace: true)),
      ('切换 源码 / 分栏 / 预览', 'Ctrl+E', _cyclePane),
      (_focusMode ? '退出专注模式' : '专注模式', 'F11', _toggleFocusMode),
      (_typewriter ? '关闭打字机模式' : '打字机模式（光标行居中）', '', () {
        setState(() => _typewriter = !_typewriter);
        _snack(_typewriter ? '打字机模式：光标行保持在屏幕中间' : '已关闭打字机模式');
        _focus.requestFocus();
        if (_typewriter) WidgetsBinding.instance.addPostFrameCallback((_) => _centerCaret());
      }),
      (_formatBar ? '隐藏格式工具栏' : '显示格式工具栏', '', () => setState(() => _formatBar = !_formatBar)),
      ('插入当前日期时间', '', () => _insertMarkdownAtCursor(isoLocal(DateTime.now()))),
      ('插入表格', '', () => _markup('table')),
      ('插入 Mermaid 图', '', () => _markup('mermaid')),
      ('插入待办', '', () => _markup('task')),
      ('朗读 / 停止朗读', '', () => _toggleTts()),
      ('导出…', '', () => _export()),
      ('打印 / 存为 PDF', '', () => _print()),
      ('发布到博客…', '', () => _publish()),
      ('移动到文件夹', '', () => _moveFolder()),
      (note.starred ? '取消星标' : '加星标', '', () async {
        await _store.toggleStar(widget.noteId);
        widget.onChanged?.call();
        if (mounted) setState(() {});
      }),
      ('立即保存', 'Ctrl+S', _flush),
      ('移到回收站', '', () => _trash()),
    ];
    final picked = await showDialog<VoidCallback>(
      context: context,
      builder: (ctx) => _CommandPalette(commands: cmds),
    );
    _menuPickedAt = DateTime.now(); // web: late back event after dialog close
    if (picked != null && mounted) picked();
  }

  Widget _focusLayout(Widget body) {
    return Stack(children: [
      Positioned.fill(
        child: Container(
          color: JingjianColors.paper,
          alignment: Alignment.topCenter,
          child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 760), child: body),
        ),
      ),
      Positioned(
        top: 4,
        right: 4,
        child: IconButton(
          tooltip: '退出专注模式（Esc）',
          onPressed: _toggleFocusMode,
          icon: Icon(Icons.close_fullscreen, color: JingjianColors.muted),
        ),
      ),
    ]);
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
    final r = replaceMatchAt(_controller.text, hit.start, _findCtl.text, _replaceCtl.text,
        caseSensitive: _findCase, regex: _findRegex);
    if (r == null) {
      _findStep(1);
      return;
    }
    _setValue(TextEditingValue(text: r.text, selection: TextSelection.collapsed(offset: r.end)));
    _findStep(1);
  }

  void _replaceAll() {
    final n = countMatches(_controller.text, _findCtl.text, caseSensitive: _findCase, regex: _findRegex);
    if (n == 0) return;
    final text = replaceAllMatches(_controller.text, _findCtl.text, _replaceCtl.text,
        caseSensitive: _findCase, regex: _findRegex);
    if (text == _controller.text) return;
    final keep = _controller.selection.isValid ? _controller.selection.baseOffset.clamp(0, text.length) : 0;
    _setValue(TextEditingValue(text: text, selection: TextSelection.collapsed(offset: keep)));
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
            icon: _imageBusy
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Icon(Icons.image_outlined, size: 20),
          ),
          IconButton(
            tooltip: '粘贴图片',
            visualDensity: VisualDensity.compact,
            onPressed: _imageBusy ? null : () => _pasteImage(),
            icon: const Icon(Icons.content_paste_go, size: 20),
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
      key: _editorBoxKey,
      color: JingjianColors.paper,
      child: TextField(
        controller: _controller,
        focusNode: _focus,
        scrollController: _editorScroll,
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
        contentInsertionConfiguration: ContentInsertionConfiguration(
          allowedMimeTypes: const ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
          onContentInserted: (c) {
            final data = c.data;
            if (data != null && data.isNotEmpty) {
              final ext = c.mimeType.split('/').last.replaceAll('jpeg', 'jpg');
              _placeImage(data, 'paste-${DateTime.now().millisecondsSinceEpoch}.$ext');
            }
          },
        ),
        decoration: InputDecoration(
          filled: false,
          contentPadding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
        ),
        inputFormatters: note.format == NoteFormat.txt ? null : [_listFormatter, _slashFormatter],
        onChanged: _onText,
      ),
    );

    final isDesktop = !kIsWeb &&
        (defaultTargetPlatform == TargetPlatform.linux ||
            defaultTargetPlatform == TargetPlatform.windows ||
            defaultTargetPlatform == TargetPlatform.macOS);
    final editorWithPaste = !isDesktop
        ? editor
        : Actions(
            actions: {
              PasteTextIntent: CallbackAction<PasteTextIntent>(onInvoke: (_) {
                _pasteImage(fallbackText: true);
                return null;
              }),
            },
            child: editor,
          );

    // Reuse the same preview widget while its inputs are unchanged, so a
    // keystroke in a big note does not rebuild (and re-split) the preview.
    final th = ThemeController.instance;
    final previewKey = '${identityHashCode(_previewText)}|${_previewText.length}|${note.format}|'
        '${JingjianColors.paper.toARGB32()}|${th.fontSize}|${th.fontFamily}|${th.oledActive}';
    if (_previewWidget == null || previewKey != _previewWidgetKey) {
      _previewWidgetKey = previewKey;
      _previewWidget = MarkdownPreview(
        content: _previewText,
        plain: note.format == NoteFormat.txt,
        onWikiTap: _openWiki,
      );
    }
    final preview = _previewWidget!;

    Widget body;
    switch (_pane) {
      case _Pane.edit:
        body = editorWithPaste;
      case _Pane.preview:
        body = preview;
      case _Pane.split:
        body = LayoutBuilder(
          builder: (context, constraints) {
            if (constraints.maxWidth < 640) {
              return Column(children: [
                Expanded(child: editorWithPaste),
                Divider(height: 1, color: JingjianColors.border),
                Expanded(child: preview),
              ]);
            }
            return Row(children: [
              Expanded(child: editorWithPaste),
              VerticalDivider(width: 1, color: JingjianColors.border),
              Expanded(child: preview),
            ]);
          },
        );
    }

    body = KeyedSubtree(key: _bodyKey, child: body);
    final count = _liveCount;
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
                if (_inCollab)
                  Padding(
                    padding: const EdgeInsets.only(right: 4),
                    child: ActionChip(
                      visualDensity: VisualDensity.compact,
                      avatar: Icon(Icons.groups_2_outlined, size: 16, color: JingjianColors.accent),
                      label: Text(_collab.session!.reconnecting ? '重连中…' : '协作 ${_collab.session!.peers.length}'),
                      onPressed: _collabMenu,
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
                    _menuPickedAt = DateTime.now();
                    switch (v) {
                      case 'outline':
                        await _outline();
                      case 'links':
                        await _links();
                      case 'count':
                        _showCount();
                      case 'history':
                        await _history();
                      case 'focus':
                        _toggleFocusMode();
                      case 'palette':
                        await _commandPalette();
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
                      case 'collab':
                        await _collabMenu();
                      case 'pasteImage':
                        await _pasteImage();
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
                    const PopupMenuItem(value: 'history', child: Text('历史版本')),
                    const PopupMenuItem(value: 'palette', child: Text('命令面板  Ctrl+Shift+P')),
                    CheckedPopupMenuItem(value: 'focus', checked: _focusMode, child: const Text('专注模式  F11')),
                    const PopupMenuItem(value: 'replace', child: Text('查找替换')),
                    CheckedPopupMenuItem(value: 'format', checked: _formatBar, child: const Text('格式工具栏')),
                    CheckedPopupMenuItem(
                        value: 'plain', checked: note.format == NoteFormat.txt, child: const Text('纯文本笔记')),
                    const PopupMenuDivider(),
                    const PopupMenuItem(value: 'export', child: Text('导出…')),
                    const PopupMenuItem(value: 'print', child: Text('打印 / 存为 PDF')),
                    const PopupMenuItem(value: 'publish', child: Text('发布到博客…')),
                    if (_inCollab || collabAvailable())
                      PopupMenuItem(value: 'collab', child: Text(_inCollab ? '协作中…' : '多人协作…')),
                    const PopupMenuItem(value: 'pasteImage', child: Text('粘贴图片')),
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
              Padding(
                padding: const EdgeInsets.only(right: 10),
                child: Text((_debounce?.isActive ?? false) ? '编辑中…' : '已保存',
                    style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
              ),
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
        const SingleActivator(LogicalKeyboardKey.keyP, control: true, shift: true): _commandPalette,
        const SingleActivator(LogicalKeyboardKey.keyP, meta: true, shift: true): _commandPalette,
        const SingleActivator(LogicalKeyboardKey.f11): _toggleFocusMode,
        const SingleActivator(LogicalKeyboardKey.escape): () {
          if (_findOpen) {
            _closeFind();
          } else if (_focusMode) {
            _toggleFocusMode();
          }
        },
      },
      child: Focus(child: _focusMode ? _focusLayout(body) : content),
    );

    final guarded = PopScope(
      canPop: !_findOpen && !_focusMode,
      onPopInvokedWithResult: (didPop, _) {
        // Web: closing the popup menu can deliver a late back event that would
        // immediately undo what the menu item just opened (专注模式/查找替换).
        final sinceMenu = DateTime.now().difference(_menuPickedAt ?? DateTime(2000));
        if (!didPop && sinceMenu < const Duration(milliseconds: 800)) return;
        if (didPop) {
          _flush();
        } else if (_findOpen) {
          _closeFind();
        } else if (_focusMode) {
          _toggleFocusMode();
        }
      },
      child: shortcuts,
    );
    if (widget.embedded) return Material(color: JingjianColors.paper, child: guarded);
    return Scaffold(body: SafeArea(child: guarded));
  }
}

class _CommandPalette extends StatefulWidget {
  const _CommandPalette({required this.commands, this.hint = '输入命令…'});
  final List<(String, String, VoidCallback)> commands;
  final String hint;

  @override
  State<_CommandPalette> createState() => _CommandPaletteState();
}

class _CommandPaletteState extends State<_CommandPalette> {
  String q = '';
  int sel = 0;

  List<(String, String, VoidCallback)> get hits {
    final s = q.trim().toLowerCase();
    if (s.isEmpty) return widget.commands;
    return widget.commands.where((c) => c.$1.toLowerCase().contains(s) || c.$2.toLowerCase().contains(s)).toList();
  }

  @override
  Widget build(BuildContext context) {
    final list = hits;
    if (sel >= list.length) sel = list.isEmpty ? 0 : list.length - 1;
    return Dialog(
      alignment: Alignment.topCenter,
      insetPadding: const EdgeInsets.fromLTRB(16, 60, 16, 16),
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520, maxHeight: 460),
        child: CallbackShortcuts(
          bindings: {
            const SingleActivator(LogicalKeyboardKey.arrowDown): () => setState(() => sel = (sel + 1).clamp(0, list.isEmpty ? 0 : list.length - 1)),
            const SingleActivator(LogicalKeyboardKey.arrowUp): () => setState(() => sel = (sel - 1).clamp(0, list.isEmpty ? 0 : list.length - 1)),
          },
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Padding(
              padding: const EdgeInsets.all(12),
              child: TextField(
                autofocus: true,
                decoration: InputDecoration(hintText: widget.hint, prefixIcon: const Icon(Icons.keyboard_command_key)),
                onChanged: (v) => setState(() {
                  q = v;
                  sel = 0;
                }),
                onSubmitted: (_) {
                  if (list.isNotEmpty) Navigator.pop(context, list[sel].$3);
                },
              ),
            ),
            Flexible(
              child: list.isEmpty
                  ? const Padding(padding: EdgeInsets.all(16), child: Text('没有匹配的命令'))
                  : ListView.builder(
                      shrinkWrap: true,
                      itemCount: list.length,
                      itemBuilder: (_, i) => ListTile(
                        dense: true,
                        selected: i == sel,
                        title: Text(list[i].$1),
                        trailing: list[i].$2.isEmpty ? null : Text(list[i].$2.split(' ').first, style: const TextStyle(fontSize: 12)),
                        onTap: () => Navigator.pop(context, list[i].$3),
                      ),
                    ),
            ),
          ]),
        ),
      ),
    );
  }
}
