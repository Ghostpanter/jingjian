import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'screens/home_shell.dart';
import 'services/app_prefs.dart';
import 'services/image_store.dart';
import 'services/note_store.dart';
import 'theme/app_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await SystemChrome.setPreferredOrientations([
    DeviceOrientation.portraitUp,
    DeviceOrientation.portraitDown,
    DeviceOrientation.landscapeLeft,
    DeviceOrientation.landscapeRight,
  ]);
  await AppPrefs.instance.init();
  await ImageStore.instance.init();
  await NoteStore.instance.init();
  runApp(const JingjianApp());
}

class JingjianApp extends StatelessWidget {
  const JingjianApp({super.key});

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
