import 'dart:async';
import 'dart:io' show Platform;

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/services.dart' show MethodChannel;

import 'package:flutter_tts/flutter_tts.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// System TTS (Android TextToSpeech / AVSpeech / SAPI / speech-dispatcher / Web Speech).
/// Mirrors old reader-tts settings: rate, language, auto-continue next chapter.
class TtsService {
  TtsService._();
  static final TtsService instance = TtsService._();

  final FlutterTts _tts = FlutterTts();
  bool _ready = false;
  bool speaking = false;
  double rate = 0.5;
  String lang = 'zh-CN';
  bool autoNext = true;
  final _done = StreamController<void>.broadcast();

  /// Fires when an utterance finishes naturally (not on stop()).
  Stream<void> get onComplete => _done.stream;

  Future<void> loadPrefs() async {
    final p = await SharedPreferences.getInstance();
    rate = p.getDouble('jingjian.tts.rate') ?? 0.5;
    lang = p.getString('jingjian.tts.lang') ?? 'zh-CN';
    autoNext = p.getBool('jingjian.tts.autoNext') ?? true;
  }

  Future<void> savePrefs() async {
    final p = await SharedPreferences.getInstance();
    await p.setDouble('jingjian.tts.rate', rate);
    await p.setString('jingjian.tts.lang', lang);
    await p.setBool('jingjian.tts.autoNext', autoNext);
  }

  Future<void> init() async {
    if (_ready) return;
    await loadPrefs();
    try {
      // We drive chunks ourselves and need to know when each one ends.
      await _tts.awaitSpeakCompletion(true);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
    } catch (_) {}
    _tts.setCancelHandler(() => speaking = false);
    _tts.setErrorHandler((msg) => lastError = '语音引擎出错：$msg');
    _ready = true;
  }

  /// Last problem, in Chinese, for the UI.
  String? lastError;
  int _gen = 0;

  /// Android TextToSpeech rejects input longer than getMaxSpeechInputLength()
  /// (4000). Split at sentence/line boundaries well below that.
  static List<String> chunks(String text, {int max = 3000}) {
    final out = <String>[];
    var rest = text.trim();
    while (rest.length > max) {
      var cut = -1;
      for (final sep in ['\n', '。', '！', '？', '!', '?', '；', ';', '.', '，', ',', ' ']) {
        final i = rest.lastIndexOf(sep, max - 1);
        if (i > max ~/ 3) {
          cut = i + 1;
          break;
        }
      }
      if (cut <= 0) cut = max;
      final piece = rest.substring(0, cut).trim();
      if (piece.isNotEmpty) out.add(piece);
      rest = rest.substring(cut).trim();
    }
    if (rest.isNotEmpty) out.add(rest);
    return out;
  }

  /// Pick a language the engine has: the saved one, else other Chinese tags,
  /// else null (use the engine default).
  static String? pickLanguage(String wanted, bool Function(String) available) {
    for (final l in [wanted, 'zh-CN', 'zh_CN', 'zh-Hans-CN', 'cmn-Hans-CN', 'zh-TW', 'zh-HK', 'zh']) {
      if (available(l)) return l;
    }
    return null;
  }

  /// Checks the engine and starts speaking in the background. Returns null when
  /// speech started, otherwise a Chinese reason. [onComplete] fires after the
  /// last chunk finishes naturally.
  Future<String?> start(String text) async {
    await init();
    lastError = null;
    final cleaned = speakable(text);
    if (cleaned.isEmpty) return '没有可朗读的文字';
    final android = !kIsWeb && Platform.isAndroid;
    if (android) {
      try {
        final engines = await _tts.getEngines;
        if (engines is List && engines.isEmpty) {
          return '系统没有安装语音引擎（TTS）。请在系统设置中安装并启用，例如“Google 文字转语音”或厂商自带引擎。';
        }
      } catch (_) {}
    }
    try {
      final langs = <String>{};
      try {
        final l = await _tts.getLanguages;
        if (l is List) langs.addAll(l.map((e) => e.toString()));
      } catch (_) {}
      bool has(String code) {
        if (langs.isEmpty) return code == lang; // cannot list: trust the setting
        final norm = code.replaceAll('_', '-').toLowerCase();
        return langs.any((x) => x.replaceAll('_', '-').toLowerCase() == norm);
      }
      final use = pickLanguage(lang, has);
      if (use != null) {
        await _tts.setLanguage(use);
      } else if (langs.isNotEmpty && !langs.any((x) => x.toLowerCase().startsWith('zh') || x.toLowerCase().startsWith('cmn'))) {
        lastError = '语音引擎没有中文语音包，将用默认语言朗读。可在系统 TTS 设置中下载中文语音。';
      }
      await _tts.setSpeechRate(rate.clamp(0.1, 1.0));
    } catch (_) {}
    final parts = chunks(cleaned);
    final gen = ++_gen;
    speaking = true;
    unawaited(_run(parts, gen));
    return null;
  }

  Future<void> _run(List<String> parts, int gen) async {
    for (final part in parts) {
      if (gen != _gen || !speaking) return;
      dynamic r;
      try {
        r = await _tts.speak(part);
      } catch (e) {
        r = 0;
      }
      if (gen != _gen) return;
      if (r != 1) {
        speaking = false;
        lastError ??= '语音引擎拒绝朗读（返回 $r）';
        _errors.add(lastError!);
        return;
      }
    }
    if (gen == _gen && speaking) {
      speaking = false;
      _done.add(null);
    }
  }

  final _errors = StreamController<String>.broadcast();

  /// Errors that happen after speech started.
  Stream<String> get onError => _errors.stream;

  /// Opens Android's TTS settings (install engine / voice data).
  static Future<bool> openSystemSettings() async {
    if (kIsWeb || !Platform.isAndroid) return false;
    try {
      return await const MethodChannel('jingjian/legacy').invokeMethod<bool>('openTtsSettings') ?? false;
    } catch (_) {
      return false;
    }
  }

  /// Back-compat wrapper.
  Future<bool> speak(String text) async => await start(text) == null;

  static String speakable(String text) => text
      .replaceFirst(RegExp(r'^---\n[\s\S]*?\n---\n'), '')
      .replaceAll(RegExp(r'```[\s\S]*?```'), ' ')
      .replaceAll(RegExp(r'\$\$[\s\S]*?\$\$'), ' ')
      .replaceAll(RegExp(r'`[^`]*`'), ' ')
      .replaceAll(RegExp(r'!\[[^\]]*\]\([^)]*\)'), ' ')
      .replaceAllMapped(RegExp(r'\[([^\]]+)\]\([^)]*\)'), (m) => m[1]!)
      .replaceAllMapped(RegExp(r'\[\[([^\]|]+)(?:\|([^\]]+))?\]\]'), (m) => m[2] ?? m[1]!)
      .replaceAll(RegExp(r'[#>*_~`$|]'), ' ')
      .replaceAll(RegExp(r'[ \t]+'), ' ')
      .trim();

  Future<void> stop() async {
    speaking = false;
    _gen++;
    try {
      await _tts.stop();
    } catch (_) {}
  }
}
