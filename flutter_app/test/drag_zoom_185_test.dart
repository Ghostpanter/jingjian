import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/widgets/mermaid_html.dart';
import 'package:jingjian/widgets/pane_resizer.dart';
import 'package:jingjian/widgets/zoom_viewer.dart';

void main() {
  group('PaneSnap', () {
    test('跟手且不越界', () {
      expect(PaneSnap.live(-30, 400), 0);
      expect(PaneSnap.live(250, 400), 250);
      expect(PaneSnap.live(900, 400), 400);
    });
    test('阈值以下收起，否则吸附到最小宽度', () {
      expect(PaneSnap.target(80, 160, 420), 0);
      expect(PaneSnap.target(120, 160, 420), 160);
      expect(PaneSnap.target(300, 160, 420), 300);
    });
  });

  testWidgets('拖动只重建窗格并松手提交一次', (t) async {
    final commits = <(double, bool)>[];
    await t.pumpWidget(MaterialApp(
      home: Scaffold(
        body: Row(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          ResizablePane(
            width: 240, collapsed: false, min: 160, max: 420,
            onCommit: (w, c) => commits.add((w, c)), onReset: () {},
            child: const Text('侧栏'),
          ),
          const Expanded(child: SizedBox()),
        ]),
      ),
    ));
    final g = find.byKey(const ValueKey('pane-gutter'));
    final gesture = await t.startGesture(t.getCenter(g));
    await gesture.moveBy(const Offset(40, 0));
    await gesture.moveBy(const Offset(40, 0));
    await t.pump();
    expect(t.getSize(find.byType(ResizablePane)).width, closeTo(240 + 80 + ResizablePane.gutter, 1));
    expect(commits, isEmpty); // not persisted mid-drag
    await gesture.up();
    await t.pumpAndSettle();
    expect(commits.single.$2, isFalse);
    expect(commits.single.$1, closeTo(320, 1));

    final g2 = await t.startGesture(t.getCenter(g));
    await g2.moveBy(const Offset(-300, 0));
    await g2.up();
    await t.pumpAndSettle();
    expect(commits.last.$2, isTrue); // snapped to collapse
  });

  test('Mermaid 页面包含缩放/拖动与工具栏', () {
    final html = buildMermaidHtml(source: 'flowchart TD\nA-->B', scriptTag: '', postJs: '', bg: '#000000', fg: '#fff', muted: '#888', dark: true);
    for (final s in [
      'setupPanZoom', 'pointermove', 'ctrlKey', "post('f')", "'z:'", "'e:'",
      'engage', 'canPan', 'passScroll', '复位', '全屏查看', 'touch-action:none',
    ]) {
      expect(html, contains(s), reason: s);
    }
    expect(html, contains('const FULL = false'));
    expect(html, contains('const passScroll = false')); // default forwardWheel false
    final scrolled = buildMermaidHtml(
      source: 'flowchart TD\nA-->B', scriptTag: '', postJs: '', bg: '#000000', fg: '#fff', muted: '#888', dark: true,
      forwardWheel: true,
    );
    expect(scrolled, contains('const passScroll = true'));
    final full = buildMermaidHtml(source: 'graph LR\nA-->B', scriptTag: '', postJs: '', bg: '#000000', fg: '#fff', muted: '#888', dark: true, fullscreen: true);
    expect(full, contains('const FULL = true'));
    expect(full, contains("if (!FULL) btn('⛶'")); // 全屏内不再显示全屏按钮
  });

  testWidgets('全屏查看器：双击放大、复位', (t) async {
    await t.pumpWidget(const MaterialApp(home: ZoomViewerPage(title: '查看公式', child: Text('E=mc^2'))));
    final st = t.state<ZoomViewerPageState>(find.byType(ZoomViewerPage));
    expect(st.scale, 1);
    await t.tap(find.byTooltip('放大'));
    await t.pump();
    expect(st.scale, greaterThan(1.3));
    await t.tap(find.byTooltip('复位'));
    await t.pump();
    expect(st.scale, 1);
  });
}
