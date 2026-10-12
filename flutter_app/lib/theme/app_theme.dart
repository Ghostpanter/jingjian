import 'package:flutter/material.dart';

class JingjianColors {
  static const paper = Color(0xFFF2EDE4);
  static const ink = Color(0xFF2C2825);
  static const muted = Color(0xFF7A7268);
  static const overlay = Color(0xFFE8E2D6);
  static const border = Color(0xFFD4CBBC);
  static const accent = Color(0xFF5B6C4D);
  static const danger = Color(0xFFA3483B);
}

ThemeData buildJingjianTheme() {
  final base = ThemeData(
    useMaterial3: true,
    brightness: Brightness.light,
    fontFamily: 'sans-serif',
    colorScheme: ColorScheme.light(
      surface: JingjianColors.paper,
      onSurface: JingjianColors.ink,
      primary: JingjianColors.accent,
      onPrimary: Colors.white,
      error: JingjianColors.danger,
      outline: JingjianColors.border,
    ),
    scaffoldBackgroundColor: JingjianColors.paper,
    appBarTheme: const AppBarTheme(
      backgroundColor: JingjianColors.paper,
      foregroundColor: JingjianColors.ink,
      elevation: 0,
      scrolledUnderElevation: 0.5,
    ),
    dividerColor: JingjianColors.border,
    inputDecorationTheme: const InputDecorationTheme(
      border: InputBorder.none,
      filled: false,
    ),
  );
  return base;
}
