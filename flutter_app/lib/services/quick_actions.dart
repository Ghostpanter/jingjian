import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// One editor top-bar shortcut.
class QuickAction {
  const QuickAction(this.id, this.label, this.icon);
  final String id;
  final String label;
  final IconData icon;
}

/// User-customisable editor shortcut bar (persisted order + visibility).
class QuickActions extends ChangeNotifier {
  QuickActions._();
  static final QuickActions instance = QuickActions._();
  static const _key = 'jingjian.editor.quickActions';

  static const all = <QuickAction>[
    QuickAction('tts', '朗读', Icons.record_voice_over_outlined),
    QuickAction('search', '查找 Ctrl+F', Icons.search),
    QuickAction('pane', '源码 / 分栏 / 预览（Ctrl+E）', Icons.vertical_split),
    QuickAction('star', '星标', Icons.star_border),
    QuickAction('export', '导出 / 分享', Icons.ios_share),
    QuickAction('folder', '移动到文件夹', Icons.drive_file_move_outline),
    QuickAction('trash', '删除（移到回收站）', Icons.delete_outline),
    QuickAction('outline', '大纲', Icons.toc),
    QuickAction('links', '双链 / 反向链接', Icons.link),
    QuickAction('history', '历史版本', Icons.history),
    QuickAction('print', '打印 / 存为 PDF', Icons.picture_as_pdf_outlined),
    QuickAction('replace', '查找替换', Icons.find_replace),
    QuickAction('format', '格式工具栏', Icons.text_format),
    QuickAction('focus', '专注模式 F11', Icons.center_focus_strong_outlined),
    QuickAction('count', '字数统计', Icons.numbers),
    QuickAction('palette', '命令面板', Icons.terminal),
    QuickAction('pasteImage', '粘贴图片', Icons.content_paste),
    QuickAction('publish', '发布到博客', Icons.public),
    QuickAction('list', '收起 / 展开笔记列表', Icons.view_sidebar_outlined),
  ];
  static const defaults = ['tts', 'search', 'pane', 'star', 'export', 'folder', 'trash'];

  static QuickAction? byId(String id) => all.where((a) => a.id == id).firstOrNull;

  List<String> enabled = List.of(defaults);
  bool _loaded = false;

  Future<void> load() async {
    if (_loaded) return;
    _loaded = true;
    final p = await SharedPreferences.getInstance();
    final v = p.getStringList(_key);
    if (v != null) enabled = sanitize(v);
    notifyListeners();
  }

  static List<String> sanitize(List<String> ids) {
    final seen = <String>{};
    return [for (final i in ids) if (byId(i) != null && seen.add(i)) i];
  }

  Future<void> save(List<String> ids) async {
    enabled = sanitize(ids);
    notifyListeners();
    final p = await SharedPreferences.getInstance();
    await p.setStringList(_key, enabled);
  }

  /// How many icons fit in [width] (48px each), reserving room for ⋮.
  static int fit(double width, int count) {
    final n = ((width - 48) / 48).floor();
    return n.clamp(0, count);
  }
}

/// Dialog: tick + drag to reorder.
Future<void> showQuickActionsEditor(BuildContext context) async {
  final qa = QuickActions.instance;
  await qa.load();
  if (!context.mounted) return;
  final order = [...qa.enabled, ...QuickActions.all.map((a) => a.id).where((i) => !qa.enabled.contains(i))];
  final on = {...qa.enabled};
  await showDialog<void>(
    context: context,
    builder: (ctx) => StatefulBuilder(
      builder: (ctx, set) => AlertDialog(
        title: const Text('自定义快捷栏'),
        content: SizedBox(
          width: 380,
          height: 480,
          child: Column(children: [
            const Text('勾选要显示在编辑器顶栏的按钮，拖动排序。放不下的会收进 ⋮ 菜单。',
                style: TextStyle(fontSize: 12)),
            const SizedBox(height: 8),
            Expanded(
              child: ReorderableListView(
                buildDefaultDragHandles: false,
                onReorderItem: (a, b) => set(() {
                  order.insert(b, order.removeAt(a));
                }),
                children: [
                  for (var i = 0; i < order.length; i++)
                    ListTile(
                      key: ValueKey(order[i]),
                      dense: true,
                      leading: Checkbox(
                        value: on.contains(order[i]),
                        onChanged: (v) => set(() => v == true ? on.add(order[i]) : on.remove(order[i])),
                      ),
                      title: Row(children: [
                        Icon(QuickActions.byId(order[i])!.icon, size: 18),
                        const SizedBox(width: 8),
                        Flexible(child: Text(QuickActions.byId(order[i])!.label)),
                      ]),
                      trailing: ReorderableDragStartListener(index: i, child: const Icon(Icons.drag_handle)),
                    ),
                ],
              ),
            ),
          ]),
        ),
        actions: [
          TextButton(
              onPressed: () => set(() {
                    on
                      ..clear()
                      ..addAll(QuickActions.defaults);
                    order
                      ..removeWhere(QuickActions.defaults.contains)
                      ..insertAll(0, QuickActions.defaults);
                  }),
              child: const Text('恢复默认')),
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('取消')),
          FilledButton(
              onPressed: () {
                qa.save(order.where(on.contains).toList());
                Navigator.pop(ctx);
              },
              child: const Text('保存')),
        ],
      ),
    ),
  );
}
