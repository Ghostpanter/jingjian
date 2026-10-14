import 'services/bookshelf.dart';
import 'services/legacy_migration.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/home_shell.dart';
import 'services/app_prefs.dart';
import 'services/image_store.dart';
import 'services/note_history.dart';
import 'services/note_store.dart';
import 'services/web_fonts.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  final cjk = loadWebCjkFont(); // web only; runs alongside storage init
  await AppPrefs.instance.init();
  await ImageStore.instance.init();
  await NoteHistory.instance.init();
  await NoteStore.instance.init();
  final migrated = await LegacyMigration.runIfNeeded();
  try {
    await migrateLegacyBookFolders(NoteStore.instance); // old 电子书/<书名> folders → shelf
  } catch (_) {}
  // New installs start in dark mode with OLED pure black.
  await ThemeController.instance.init(newInstall: NoteStore.instance.firstRun && migrated == 0);
  // Don't hold the first frame for long on slow links; it finishes in the background.
  await Future.any([cjk, Future<void>.delayed(const Duration(seconds: 3))]);
  runApp(const JingjianApp());
}

class JingjianApp extends StatefulWidget {
  const JingjianApp({super.key});

  @override
  State<JingjianApp> createState() => _JingjianAppState();
}

class _JingjianAppState extends State<JingjianApp> with WidgetsBindingObserver {
  final _theme = ThemeController.instance;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _theme.addListener(_onTheme);
  }

  @override
  void dispose() {
    _theme.removeListener(_onTheme);
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  void didChangePlatformBrightness() {
    _theme.onPlatformBrightness(
      WidgetsBinding.instance.platformDispatcher.platformBrightness,
    );
  }

  /// Colors are read from [JingjianColors] at build time, so mark the whole
  /// tree dirty (keeps state: open notes, routes, editor text).
  void _onTheme() {
    setState(() {});
    void mark(Element el) {
      el.markNeedsBuild();
      el.visitChildren(mark);
    }

    (context as Element).visitChildren(mark);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: '静笺',
      debugShowCheckedModeBanner: false,
      theme: buildJingjianTheme(),
      home: const HomeShell(),
    );
  }
}
