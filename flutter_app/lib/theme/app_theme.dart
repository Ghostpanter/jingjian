import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Theme ids match the old web app (theme.ts) plus `system`.
enum ThemeId { system, paper, ink, github, githubDark }

const themeLabels = {
  ThemeId.system: '跟随系统',
  ThemeId.paper: '宣纸',
  ThemeId.ink: '墨夜',
  ThemeId.github: 'GitHub',
  ThemeId.githubDark: 'GitHub 夜间',
};

enum EditorFont { serif, sans, mono }

const editorFontLabels = {EditorFont.serif: '宋体', EditorFont.sans: '黑体', EditorFont.mono: '等宽'};
const editorSizes = {'sm': 16.0, 'md': 18.0, 'lg': 20.0, 'xl': 22.0};
const editorSizeLabels = {'sm': '小', 'md': '中', 'lg': '大', 'xl': '特大'};

enum NoteSort { updated, created, title, opened }

const noteSortLabels = {
  NoteSort.updated: '修改时间',
  NoteSort.created: '创建时间',
  NoteSort.title: '标题',
  NoteSort.opened: '最近打开',
};

class Palette {
  const Palette({
    required this.dark,
    required this.paper,
    required this.surface,
    required this.ink,
    required this.muted,
    required this.overlay,
    required this.border,
    required this.accent,
    required this.danger,
  });
  final bool dark;
  final Color paper; // page background
  final Color surface; // sidebar / bars / dialogs
  final Color ink;
  final Color muted;
  final Color overlay; // chips, code, selected tile
  final Color border;
  final Color accent;
  final Color danger;
}

const _paper = Palette(
  dark: false,
  paper: Color(0xFFF2EDE4),
  surface: Color(0xFFF7F3EB),
  ink: Color(0xFF2C2825),
  muted: Color(0xFF7A7268),
  overlay: Color(0xFFE8E2D6),
  border: Color(0xFFD4CBBC),
  accent: Color(0xFF5B6C4D),
  danger: Color(0xFFA3483B),
);
const _ink = Palette(
  dark: true,
  paper: Color(0xFF161513),
  surface: Color(0xFF1E1C19),
  ink: Color(0xFFE8E2D6),
  muted: Color(0xFF9A9286),
  overlay: Color(0xFF2A2723),
  border: Color(0xFF3A3630),
  accent: Color(0xFF8FAFA4),
  danger: Color(0xFFE07A6A),
);
const _github = Palette(
  dark: false,
  paper: Color(0xFFFFFFFF),
  surface: Color(0xFFF6F8FA),
  ink: Color(0xFF1F2328),
  muted: Color(0xFF656D76),
  overlay: Color(0xFFEFF2F5),
  border: Color(0xFFD0D7DE),
  accent: Color(0xFF0969DA),
  danger: Color(0xFFCF222E),
);
const _githubDark = Palette(
  dark: true,
  paper: Color(0xFF0D1117),
  surface: Color(0xFF161B22),
  ink: Color(0xFFE6EDF3),
  muted: Color(0xFF8D96A0),
  overlay: Color(0xFF21262D),
  border: Color(0xFF30363D),
  accent: Color(0xFF4493F8),
  danger: Color(0xFFF85149),
);

/// OLED: every surface is pure black; borders stay visible so panes separate.
Palette oledOf(Palette base) => Palette(
      dark: true,
      paper: const Color(0xFF000000),
      surface: const Color(0xFF000000),
      ink: base.ink,
      muted: base.muted,
      overlay: const Color(0xFF121212),
      border: const Color(0xFF2A2A2A),
      accent: base.accent,
      danger: base.danger,
    );

/// Mutable current palette. Widgets read these at build time; the app
/// rebuilds from the root when [ThemeController] changes.
class JingjianColors {
  static Color paper = _paper.paper;
  static Color surface = _paper.surface;
  static Color ink = _paper.ink;
  static Color muted = _paper.muted;
  static Color overlay = _paper.overlay;
  static Color border = _paper.border;
  static Color accent = _paper.accent;
  static Color danger = _paper.danger;
  static bool dark = false;

  static void apply(Palette p) {
    paper = p.paper;
    surface = p.surface;
    ink = p.ink;
    muted = p.muted;
    overlay = p.overlay;
    border = p.border;
    accent = p.accent;
    danger = p.danger;
    dark = p.dark;
  }

  static String cssHex(Color c) =>
      '#${(c.toARGB32() & 0xFFFFFF).toRadixString(16).padLeft(6, '0')}';
}

class ThemeController extends ChangeNotifier {
  ThemeController._();
  static final ThemeController instance = ThemeController._();

  static const _kTheme = 'jingjian.theme.v1';
  static const _kOled = 'jingjian.theme.oled.v1';
  static const _kFont = 'jingjian.editor.font.v1';
  static const _kSize = 'jingjian.editor.size.v1';
  static const _kSort = 'jingjian.sort.v1';
  static const _kSidebarW = 'jingjian.sidebar.width.v1';
  static const _kListW = 'jingjian.list.width.v1';
  static const _kSidebarHidden = 'jingjian.sidebar.collapsed.v1';
  static const _kListHidden = 'jingjian.list.collapsed.v1';

  SharedPreferences? _prefs;
  ThemeId themeId = ThemeId.system;
  bool oled = false;
  EditorFont font = EditorFont.sans;
  String size = 'sm';
  NoteSort sort = NoteSort.updated;
  double sidebarWidth = 230;
  double listWidth = 300;
  bool sidebarCollapsed = false;
  bool listCollapsed = false;
  Brightness _platform = Brightness.light;

  Future<void> init({bool newInstall = false}) async {
    _prefs = await SharedPreferences.getInstance();
    // Default for new installs: dark (墨夜) + OLED black. Saved choices always win,
    // and existing users without a saved theme keep the old defaults.
    if (newInstall && _prefs!.getString(_kTheme) == null) await _prefs!.setString(_kTheme, ThemeId.ink.name);
    if (newInstall && _prefs!.getBool(_kOled) == null) await _prefs!.setBool(_kOled, true);
    final t = _prefs!.getString(_kTheme);
    themeId = ThemeId.values.firstWhere((e) => e.name == t, orElse: () => ThemeId.system);
    oled = _prefs!.getBool(_kOled) ?? false;
    final f = _prefs!.getString(_kFont);
    font = EditorFont.values.firstWhere((e) => e.name == f, orElse: () => EditorFont.sans);
    final s = _prefs!.getString(_kSize);
    size = editorSizes.containsKey(s) ? s! : 'sm';
    final so = _prefs!.getString(_kSort);
    sort = NoteSort.values.firstWhere((e) => e.name == so, orElse: () => NoteSort.updated);
    sidebarWidth = (_prefs!.getDouble(_kSidebarW) ?? 230).clamp(sidebarMin, sidebarMax);
    listWidth = (_prefs!.getDouble(_kListW) ?? 300).clamp(listMin, listMax);
    sidebarCollapsed = _prefs!.getBool(_kSidebarHidden) ?? false;
    listCollapsed = _prefs!.getBool(_kListHidden) ?? false;
    _platform = WidgetsBinding.instance.platformDispatcher.platformBrightness;
    _recompute();
  }

  void onPlatformBrightness(Brightness b) {
    if (_platform == b) return;
    _platform = b;
    if (themeId == ThemeId.system) {
      _recompute();
      notifyListeners();
    }
  }

  Palette get basePalette {
    switch (themeId) {
      case ThemeId.paper:
        return _paper;
      case ThemeId.ink:
        return _ink;
      case ThemeId.github:
        return _github;
      case ThemeId.githubDark:
        return _githubDark;
      case ThemeId.system:
        return _platform == Brightness.dark ? _ink : _paper;
    }
  }

  /// OLED only takes effect while the effective theme is dark.
  Palette get palette {
    final base = basePalette;
    return base.dark && oled ? oledOf(base) : base;
  }

  bool get isDark => basePalette.dark;
  bool get oledActive => isDark && oled;

  double get fontSize => editorSizes[size] ?? 16;
  String? get fontFamily => switch (font) {
        EditorFont.serif => 'serif',
        EditorFont.sans => 'sans-serif',
        EditorFont.mono => 'monospace',
      };

  void _recompute() {
    final p = palette;
    JingjianColors.apply(p);
    SystemChrome.setSystemUIOverlayStyle(SystemUiOverlayStyle(
      statusBarColor: p.surface,
      statusBarIconBrightness: p.dark ? Brightness.light : Brightness.dark,
      statusBarBrightness: p.dark ? Brightness.dark : Brightness.light,
      systemNavigationBarColor: p.paper,
      systemNavigationBarIconBrightness: p.dark ? Brightness.light : Brightness.dark,
      systemNavigationBarDividerColor: p.border,
    ));
  }

  Future<void> setTheme(ThemeId id) async {
    themeId = id;
    await _prefs?.setString(_kTheme, id.name);
    _recompute();
    notifyListeners();
  }

  Future<void> setOled(bool v) async {
    oled = v;
    await _prefs?.setBool(_kOled, v);
    _recompute();
    notifyListeners();
  }

  Future<void> setFont(EditorFont f) async {
    font = f;
    await _prefs?.setString(_kFont, f.name);
    notifyListeners();
  }

  Future<void> setSize(String s) async {
    size = s;
    await _prefs?.setString(_kSize, s);
    notifyListeners();
  }

  static const sidebarMin = 160.0, sidebarMax = 420.0, listMin = 220.0, listMax = 560.0;

  /// Persist pane widths (no notify: the shell already rebuilt while dragging).
  Future<void> saveWidths({double? sidebar, double? list}) async {
    if (sidebar != null) {
      sidebarWidth = sidebar.clamp(sidebarMin, sidebarMax);
      await _prefs?.setDouble(_kSidebarW, sidebarWidth);
    }
    if (list != null) {
      listWidth = list.clamp(listMin, listMax);
      await _prefs?.setDouble(_kListW, listWidth);
    }
  }

  /// Collapse / expand the folder sidebar or the note list (persisted).
  Future<void> setCollapsed({bool? sidebar, bool? list}) async {
    if (sidebar != null) {
      sidebarCollapsed = sidebar;
      await _prefs?.setBool(_kSidebarHidden, sidebar);
    }
    if (list != null) {
      listCollapsed = list;
      await _prefs?.setBool(_kListHidden, list);
    }
    notifyListeners();
  }

  /// Dragging a pane this far below its minimum collapses it.
  static const collapseSlack = 48.0;

  Future<void> setSort(NoteSort s) async {
    sort = s;
    await _prefs?.setString(_kSort, s.name);
    notifyListeners();
  }
}

ThemeData buildJingjianTheme() {
  final p = ThemeController.instance.palette;
  final scheme = (p.dark ? const ColorScheme.dark() : const ColorScheme.light()).copyWith(
    surface: p.paper,
    onSurface: p.ink,
    surfaceContainerLowest: p.paper,
    surfaceContainerLow: p.surface,
    surfaceContainer: p.surface,
    surfaceContainerHigh: p.surface,
    surfaceContainerHighest: p.overlay,
    primary: p.accent,
    onPrimary: p.dark ? Colors.black : Colors.white,
    secondary: p.accent,
    error: p.danger,
    outline: p.border,
    outlineVariant: p.border,
  );
  final borderSide = BorderSide(color: p.border);
  return ThemeData(
    useMaterial3: true,
    brightness: p.dark ? Brightness.dark : Brightness.light,
    fontFamily: 'sans-serif',
    fontFamilyFallback: kIsWeb ? const ['JJCJK'] : null,
    colorScheme: scheme,
    scaffoldBackgroundColor: p.paper,
    canvasColor: p.paper,
    appBarTheme: AppBarTheme(
      backgroundColor: p.surface,
      foregroundColor: p.ink,
      elevation: 0,
      scrolledUnderElevation: 0,
      shape: Border(bottom: borderSide),
    ),
    dividerColor: p.border,
    dividerTheme: DividerThemeData(color: p.border, space: 1, thickness: 1),
    dialogTheme: DialogThemeData(
      backgroundColor: p.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: borderSide),
    ),
    bottomSheetTheme: BottomSheetThemeData(
      backgroundColor: p.surface,
      shape: RoundedRectangleBorder(
        borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
        side: borderSide,
      ),
    ),
    popupMenuTheme: PopupMenuThemeData(
      color: p.surface,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: borderSide),
    ),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: p.overlay,
      contentTextStyle: TextStyle(color: p.ink),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8), side: borderSide),
      behavior: SnackBarBehavior.floating,
    ),
    listTileTheme: ListTileThemeData(
      selectedColor: p.accent,
      selectedTileColor: p.overlay,
      textColor: p.ink,
      iconColor: p.muted,
    ),
    inputDecorationTheme: const InputDecorationTheme(border: InputBorder.none, filled: false),
  );
}
