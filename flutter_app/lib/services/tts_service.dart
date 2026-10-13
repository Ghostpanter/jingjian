import 'dart:async';

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
      await _tts.awaitSpeakCompletion(false);
      await _tts.setVolume(1.0);
      await _tts.setPitch(1.0);
    } catch (_) {}
    _tts.setCompletionHandler(() {
      final was = speaking;
      speaking = false;
      if (was) _done.add(null);
    });
    _tts.setCancelHandler(() => speaking = false);
    _tts.setErrorHandler((_) => speaking = false);
    _ready = true;
  }

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

  Future<bool> speak(String text) async {
    await init();
    final cleaned = speakable(text);
    if (cleaned.isEmpty) return false;
    try {
      await _tts.setLanguage(lang);
      await _tts.setSpeechRate(rate.clamp(0.1, 1.0));
      speaking = true;
      final r = await _tts.speak(cleaned);
      if (r == 0) speaking = false;
      return r != 0;
    } catch (_) {
      speaking = false;
      return false;
    }
  }

  Future<void> stop() async {
    speaking = false;
    try {
      await _tts.stop();
    } catch (_) {}
  }
}
