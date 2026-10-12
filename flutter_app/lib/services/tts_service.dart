import 'package:flutter_tts/flutter_tts.dart';

class TtsService {
  TtsService._();
  static final TtsService instance = TtsService._();

  final FlutterTts _tts = FlutterTts();
  bool _ready = false;
  bool speaking = false;

  Future<void> init() async {
    if (_ready) return;
    await _tts.setLanguage('zh-CN');
    await _tts.setSpeechRate(0.5);
    await _tts.setVolume(1.0);
    await _tts.setPitch(1.0);
    _tts.setCompletionHandler(() {
      speaking = false;
    });
    _tts.setCancelHandler(() {
      speaking = false;
    });
    _ready = true;
  }

  Future<void> speak(String text, {double rate = 0.5}) async {
    await init();
    final cleaned = text
        .replaceAll(RegExp(r'```[\s\S]*?```'), ' ')
        .replaceAll(RegExp(r'`[^`]*`'), ' ')
        .replaceAll(RegExp(r'!?\[[^\]]*\]\([^)]*\)'), ' ')
        .replaceAll(RegExp(r'[#>*_~`$]'), ' ')
        .replaceAll(RegExp(r'\s+'), ' ')
        .trim();
    if (cleaned.isEmpty) return;
    speaking = true;
    await _tts.setSpeechRate(rate.clamp(0.2, 1.0));
    await _tts.speak(cleaned);
  }

  Future<void> stop() async {
    await _tts.stop();
    speaking = false;
  }
}
