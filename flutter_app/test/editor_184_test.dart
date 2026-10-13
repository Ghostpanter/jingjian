import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/screens/home_shell.dart';
import 'package:jingjian/services/app_prefs.dart';
import 'package:jingjian/services/image_store.dart';
import 'package:jingjian/services/note_history.dart';
import 'package:jingjian/services/note_store.dart';
import 'package:jingjian/theme/app_theme.dart';
import 'package:shared_preferences/shared_preferences.dart';

final editorField = find.byWidgetPredicate((w) => w is TextField && (w.controller?.text.contains('专注测试') ?? false));

void main() {
  late Directory root;
  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    await AppPrefs.instance.init();
    root = await Directory.systemTemp.createTemp('jje');
    await ImageStore.instance.init(root: root.path);
    await NoteHistory.instance.init(root: root.path);
    await NoteStore.instance.init(root: root.path);
    for (final n in List.of(NoteStore.instance.allNotes)) {
      await NoteStore.instance.purge(n.id);
    }
    await NoteStore.instance.create(content: '# 专注测试\n\n正文 apple');
  });

  Future<void> open(WidgetTester t) async {
    t.view.physicalSize = const Size(1280, 800);
    t.view.devicePixelRatio = 1;
    addTearDown(t.view.reset);
    await ThemeController.instance.init();
    await t.pumpWidget(const MaterialApp(home: HomeShell()));
    await t.pump(const Duration(milliseconds: 500));
    await t.tap(find.text('专注测试').first);
    await t.pump(const Duration(milliseconds: 500));
    await t.tap(editorField);
    await t.pump();
  }

  testWidgets('F11 focus mode hides panes and app bar; Esc restores', (t) async {
    await open(t);
    expect(find.byType(AppBar), findsOneWidget);
    await t.sendKeyEvent(LogicalKeyboardKey.f11);
    await t.pump(const Duration(milliseconds: 300));
    expect(find.byType(AppBar), findsNothing);
    expect(find.text('全部笔记'), findsNothing);
    expect(find.byTooltip('退出专注模式（Esc）'), findsOneWidget);
    await t.sendKeyEvent(LogicalKeyboardKey.escape);
    await t.pump(const Duration(seconds: 5)); // let the snackbar go
    expect(find.byType(AppBar), findsOneWidget);
    expect(find.text('全部笔记'), findsOneWidget);
  });

  testWidgets('Ctrl+Shift+P opens the command palette and filters', (t) async {
    await open(t);
    await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await t.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await t.sendKeyEvent(LogicalKeyboardKey.keyP);
    await t.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('输入命令…'), findsOneWidget);
    await t.enterText(find.widgetWithText(TextField, '输入命令…'), '历史');
    await t.pump();
    expect(find.text('历史版本'), findsWidgets);
    await t.tap(find.text('历史版本').last);
    await t.pump(const Duration(milliseconds: 500));
    expect(find.textContaining('还没有历史版本'), findsOneWidget);
  });

  testWidgets('status bar shows save state', (t) async {
    await open(t);
    expect(find.text('已保存'), findsOneWidget);
    await t.enterText(editorField, '# 专注测试\n\n改了');
    await t.pump();
    expect(find.text('编辑中…'), findsOneWidget);
    await t.pump(const Duration(milliseconds: 400));
    await t.runAsync(() => Future<void>.delayed(const Duration(milliseconds: 100)));
    await t.pump();
    expect(find.text('已保存'), findsOneWidget);
  });

  testWidgets('"/" on an empty line opens the insert menu; pick replaces the slash', (t) async {
    await open(t);
    final tf = t.widget<TextField>(editorField);
    final c = tf.controller!;
    c.selection = TextSelection.collapsed(offset: c.text.length);
    await t.enterText(editorField, '${c.text}\n');
    await t.pump();
    // Simulate typing "/" through the formatter path.
    final before = c.text;
    t.testTextInput.updateEditingValue(TextEditingValue(text: '$before/', selection: TextSelection.collapsed(offset: before.length + 1)));
    await t.pump();
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('二级标题'), findsOneWidget);
    await t.enterText(find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText?.startsWith('插入') == true), 'h2');
    await t.pump();
    await t.tap(find.text('二级标题'));
    await t.pump(const Duration(milliseconds: 300));
    expect(c.text.contains('/'), isFalse);
    expect(c.text, contains('## '));
  });

  testWidgets('"/" inside text does not open the menu', (t) async {
    await open(t);
    final c = t.widget<TextField>(editorField).controller!;
    final before = c.text;
    t.testTextInput.updateEditingValue(TextEditingValue(text: '$before/', selection: TextSelection.collapsed(offset: before.length + 1)));
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('二级标题'), findsNothing);
    expect(c.text, '$before/');
  });

  testWidgets('typewriter mode keeps the caret near the vertical centre', (t) async {
    await open(t);
    final c = t.widget<TextField>(editorField).controller!;
    await t.enterText(editorField, '# 专注测试\n${List.generate(200, (i) => '第$i行').join('\n')}');
    await t.pump();
    // turn on via palette
    await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
    await t.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
    await t.sendKeyEvent(LogicalKeyboardKey.keyP);
    await t.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
    await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
    await t.pump(const Duration(milliseconds: 300));
    await t.enterText(find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == '输入命令…'), '打字机');
    await t.pump();
    await t.tap(find.textContaining('打字机模式'));
    await t.pump(const Duration(seconds: 1));
    c.selection = const TextSelection.collapsed(offset: 400);
    t.testTextInput.updateEditingValue(TextEditingValue(text: '${c.text.substring(0, 400)}x${c.text.substring(400)}',
        selection: const TextSelection.collapsed(offset: 401)));
    for (var i = 0; i < 20; i++) {
      await t.pump(const Duration(milliseconds: 50));
    }
    final ed = t.state<EditableTextState>(find.descendant(of: editorField, matching: find.byType(EditableText)));
    final re = ed.renderEditable;
    final caretY = re.getLocalRectForCaret(const TextPosition(offset: 401)).center.dy;
    expect((caretY - re.size.height / 2).abs(), lessThan(60));
    await t.pump(const Duration(seconds: 5));
  });

  testWidgets('palette: no match + Enter is harmless; Esc closes', (t) async {
    await open(t);
    final c = t.widget<TextField>(editorField).controller!;
    final before = c.text;
    for (var k = 0; k < 2; k++) {
      await t.sendKeyDownEvent(LogicalKeyboardKey.controlLeft);
      await t.sendKeyDownEvent(LogicalKeyboardKey.shiftLeft);
      await t.sendKeyEvent(LogicalKeyboardKey.keyP);
      await t.sendKeyUpEvent(LogicalKeyboardKey.shiftLeft);
      await t.sendKeyUpEvent(LogicalKeyboardKey.controlLeft);
      await t.pump(const Duration(milliseconds: 300));
    }
    expect(find.text('输入命令…'), findsOneWidget); // second shortcut must not stack a 2nd palette
    final field = find.byWidgetPredicate((w) => w is TextField && w.decoration?.hintText == '输入命令…');
    await t.enterText(field, 'zzzz不存在');
    await t.pump();
    expect(find.text('没有匹配的命令'), findsOneWidget);
    await t.testTextInput.receiveAction(TextInputAction.done);
    await t.pump(const Duration(milliseconds: 300));
    await t.sendKeyEvent(LogicalKeyboardKey.escape);
    await t.pump(const Duration(milliseconds: 300));
    await t.pump(const Duration(milliseconds: 300));
    expect(find.text('输入命令…'), findsNothing);
    expect(c.text, before);
  });
}
