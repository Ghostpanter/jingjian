import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/screens/home_shell.dart';
import 'package:jingjian/services/app_prefs.dart';
import 'package:jingjian/services/image_store.dart';
import 'package:jingjian/services/note_store.dart';
import 'package:jingjian/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  late Directory root;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AppPrefs.instance.init();
    root = await Directory.systemTemp.createTemp('jjl');
    await ImageStore.instance.init(root: root.path);
    await NoteStore.instance.init(root: root.path);
    for (final n in List.of(NoteStore.instance.allNotes)) {
      await NoteStore.instance.purge(n.id); // welcome note has Mermaid (needs a WebView)
    }
    await NoteStore.instance.create(content: '# 测试\n\n正文', folder: '甲');
  });

  test('new install defaults to dark + OLED; saved choice and existing users win', () async {
    SharedPreferences.setMockInitialValues({});
    await ThemeController.instance.init(newInstall: true);
    expect(ThemeController.instance.themeId, ThemeId.ink);
    expect(ThemeController.instance.oledActive, true);

    SharedPreferences.setMockInitialValues({'jingjian.theme.v1': 'paper', 'jingjian.theme.oled.v1': false});
    await ThemeController.instance.init(newInstall: true);
    expect(ThemeController.instance.themeId, ThemeId.paper);
    expect(ThemeController.instance.oled, false);

    SharedPreferences.setMockInitialValues({});
    await ThemeController.instance.init(newInstall: false);
    expect(ThemeController.instance.themeId, ThemeId.system);
    expect(ThemeController.instance.oled, false);
  });

  Future<void> pump(WidgetTester t, Size size) async {
    t.view.physicalSize = size;
    t.view.devicePixelRatio = 1;
    await ThemeController.instance.init();
    await t.pumpWidget(const MaterialApp(home: HomeShell()));
    await t.pump(const Duration(milliseconds: 500));
  }

  for (final size in [const Size(1280, 800), const Size(400, 800)]) {
    testWidgets('sidebar drag-to-collapse and button expand at ${size.width.toInt()}px', (t) async {
      await t.runAsync(() async {});
      await pump(t, size);
      expect(find.text('全部笔记'), findsOneWidget);
      final handle = find.byTooltip('拖动调整宽度，拖到最窄会收起；双击恢复').first;
      await t.drag(handle, const Offset(-400, 0));
      await t.pump(const Duration(seconds: 1));
      expect(ThemeController.instance.sidebarCollapsed, true);
      expect(find.text('全部笔记'), findsNothing);
      await t.tap(find.byTooltip('展开文件夹栏'));
      await t.pump();
      expect(ThemeController.instance.sidebarCollapsed, false);
      expect(find.text('全部笔记'), findsOneWidget);
      // widen by dragging
      await t.pump(const Duration(seconds: 1));
      final before = ThemeController.instance.sidebarWidth;
      final dx = size.width >= 720 ? 40.0 : -30.0;
      await t.drag(find.byTooltip('拖动调整宽度，拖到最窄会收起；双击恢复').first, Offset(dx, 0));
      await t.pump(const Duration(seconds: 1));
      final after = ThemeController.instance.sidebarWidth;
      if (size.width >= 720) {
        expect(after, greaterThan(before));
      } else {
        expect(after, lessThanOrEqualTo(size.width * 0.45)); // phone: list keeps most of the width
        expect(ThemeController.instance.sidebarCollapsed, false);
      }
      final prefs = await SharedPreferences.getInstance();
      expect(prefs.getBool('jingjian.sidebar.collapsed.v1'), false);
      if (size.width >= 720) {
        await t.tap(find.byTooltip('收起笔记列表（编辑区全宽）'));
        await t.pump();
        expect(ThemeController.instance.listCollapsed, true);
        await t.tap(find.byTooltip('展开笔记列表'));
        await t.pump();
      }
      await t.pump(const Duration(seconds: 1));
      t.view.reset();
    });
  }
}
