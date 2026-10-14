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
  /// 'auto' = detect per segment; 'system' = engine default; else a fixed tag.
  String lang = 'auto';
  bool autoNext = true;
  final _done = StreamController<void>.broadcast();

  /// Fires when an utterance finishes naturally (not on stop()).
  Stream<void> get onComplete => _done.stream;

  Future<void> loadPrefs() async {
    final p = await SharedPreferences.getInstance();
    rate = p.getDouble('jingjian.tts.rate') ?? 0.5;
    // New key: the old one was force-saved as zh-CN with every rate change,
    // which made all text (English etc.) go through the Chinese voice.
    lang = p.getString('jingjian.tts.lang2') ?? 'auto';
    autoNext = p.getBool('jingjian.tts.autoNext') ?? true;
  }

  Future<void> savePrefs() async {
    final p = await SharedPreferences.getInstance();
    await p.setDouble('jingjian.tts.rate', rate);
    await p.setString('jingjian.tts.lang2', lang);
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

  /// Candidate engine tags per detected script language, best first.
  static const langCandidates = <String, List<String>>{
    'zh': ['zh-CN', 'zh-Hans-CN', 'cmn-Hans-CN', 'cmn-CN', 'zh-TW', 'zh-HK', 'yue-HK', 'zh'],
    'en': ['en-US', 'en-GB', 'en-AU', 'en-IN', 'en'],
    'ja': ['ja-JP', 'ja'],
    'ko': ['ko-KR', 'ko'],
    'ru': ['ru-RU', 'ru'],
  };
  static const langNames = {'zh': '中文', 'en': '英文', 'ja': '日文', 'ko': '韩文', 'ru': '俄文'};

  /// Primary-language aliases engines report (ISO 639-1/2/3, Mandarin/Cantonese).
  static String primary(String tag) {
    final p = tag.replaceAll('_', '-').toLowerCase().split('-').first;
    return switch (p) {
      'cmn' || 'zho' || 'chi' || 'yue' => 'zh',
      'eng' => 'en',
      'jpn' => 'ja',
      'kor' => 'ko',
      'rus' => 'ru',
      _ => p,
    };
  }

  /// Resolve a script language ('zh', 'en', …) to a tag the engine has.
  /// [preferred] (e.g. user's zh-TW) wins when it matches. Exact tag first,
  /// then any engine tag with the same primary language (handles zh-Hans,
  /// cmn-Hans-CN, zho-CHN …). Returns null when the engine lacks it.
  static String? resolve(String key, Iterable<String> engineLangs, {String? preferred}) {
    String norm(String x) => x.replaceAll('_', '-').toLowerCase();
    final list = engineLangs.toList();
    final cands = [
      if (preferred != null && primary(preferred) == key) preferred,
      ...?langCandidates[key],
    ];
    for (final c in cands) {
      final hit = list.where((x) => norm(x) == norm(c)).firstOrNull;
      if (hit != null) return hit;
    }
    return list.where((x) => primary(x) == key).firstOrNull;
  }

  /// Back-compat helper (kept for old callers/tests).
  static String? pickLanguage(String wanted, bool Function(String) available) {
    for (final l in [wanted, ...langCandidates['zh']!, 'zh_CN']) {
      if (available(l)) return l;
    }
    return null;
  }

  static String? _scriptOf(int c) {
    if ((c >= 0x3040 && c <= 0x30FF) || (c >= 0x31F0 && c <= 0x31FF) || (c >= 0xFF66 && c <= 0xFF9D)) return 'ja';
    if ((c >= 0xAC00 && c <= 0xD7AF) || (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F)) return 'ko';
    if ((c >= 0x4E00 && c <= 0x9FFF) || (c >= 0x3400 && c <= 0x4DBF) || (c >= 0xF900 && c <= 0xFAFF) ||
        (c >= 0x20000 && c <= 0x2FA1F)) {
      return 'zh';
    }
    if ((c >= 0x41 && c <= 0x5A) || (c >= 0x61 && c <= 0x7A) || (c >= 0xC0 && c <= 0x24F)) return 'en';
    if (c >= 0x400 && c <= 0x4FF) return 'ru';
    return null; // digits, punctuation, spaces: stay with the current segment
  }

  /// Split text into (language, text) runs by script. Kanji next to kana is
  /// Japanese; very short Latin runs inside other text (e.g. "A股", "PDF")
  /// stay with their neighbour to avoid voice flapping. Lossless.
  static List<(String, String)> segments(String text) {
    final raw = <(String?, StringBuffer)>[];
    for (final r in text.runes) {
      final s = _scriptOf(r);
      if (raw.isEmpty || (s != null && raw.last.$1 != null && raw.last.$1 != s)) {
        raw.add((s, StringBuffer()));
      } else if (s != null && raw.last.$1 == null) {
        raw[raw.length - 1] = (s, raw.last.$2);
      }
      raw.last.$2.writeCharCode(r);
    }
    var segs = [for (final x in raw) (x.$1 ?? 'neutral', x.$2.toString())];
    // Kanji adjacent to kana → Japanese.
    final hasJa = segs.any((x) => x.$1 == 'ja');
    if (hasJa) {
      var changed = true;
      while (changed) {
        changed = false;
        for (var i = 0; i < segs.length; i++) {
          bool ja(int j) => j >= 0 && j < segs.length && segs[j].$1 == 'ja';
          if (segs[i].$1 == 'zh' && (ja(i - 1) || ja(i + 1))) {
            segs[i] = ('ja', segs[i].$2);
            changed = true;
          }
        }
      }
    }
    // Absorb short Latin runs (≤3 letters) into a non-Latin neighbour.
    for (var i = 0; i < segs.length; i++) {
      final (l, t) = segs[i];
      if (segs.length > 1 && l == 'en' && t.replaceAll(RegExp(r'[^A-Za-z]'), '').length <= 3) {
        final n = i > 0 ? segs[i - 1].$1 : segs[i + 1].$1;
        segs[i] = (n, t);
      }
    }
    // Merge consecutive same-language runs.
    final out = <(String, String)>[];
    for (final s in segs) {
      if (out.isNotEmpty && out.last.$1 == s.$1) {
        out[out.length - 1] = (s.$1, out.last.$2 + s.$2);
      } else {
        out.add(s);
      }
    }
    return out.where((s) => s.$2.trim().isNotEmpty).toList();
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
    final langs = <String>{};
    try {
      final l = await _tts.getLanguages;
      if (l is List) langs.addAll(l.map((e) => e.toString()));
    } catch (_) {}
    try {
      await _tts.setSpeechRate(rate.clamp(0.1, 1.0));
    } catch (_) {}

    // Build (tag or null, text) parts.
    final plan = <(String?, String)>[];
    final missing = <String>{};
    final cache = <String, String?>{};
    Future<String?> tagFor(String key, {String? preferred}) async {
      if (cache.containsKey(key)) return cache[key];
      String? tag;
      if (langs.isNotEmpty) {
        tag = resolve(key, langs, preferred: preferred);
      } else {
        // Engine can't list languages: ask it directly.
        for (final c in [if (preferred != null) preferred, ...?langCandidates[key]]) {
          try {
            final ok = await _tts.isLanguageAvailable(c);
            if (ok == true || ok == 1) {
              tag = c;
              break;
            }
          } catch (_) {}
        }
      }
      if (tag == null) missing.add(key);
      return cache[key] = tag;
    }

    if (lang == 'system') {
      plan.add((null, cleaned));
    } else if (lang == 'auto') {
      for (final (k, t) in segments(cleaned)) {
        plan.add((k == 'neutral' ? await tagFor('zh') : await tagFor(k), t));
      }
    } else {
      plan.add((await tagFor(primary(lang), preferred: lang), cleaned));
    }
    if (missing.isNotEmpty) {
      final names = missing.map((k) => langNames[k] ?? k).join('、');
      lastError = '语音引擎没有$names语音包，这部分将用默认语音朗读。可在系统 TTS 设置中下载对应语音。';
    }
    final parts = <(String?, String)>[
      for (final (tag, t) in plan)
        for (final c in chunks(t)) (tag, c),
    ];
    final gen = ++_gen;
    speaking = true;
    unawaited(_run(parts, gen));
    return null;
  }

  Future<void> _run(List<(String?, String)> parts, int gen) async {
    String? cur;
    for (final (tag, part) in parts) {
      if (gen != _gen || !speaking) return;
      dynamic r;
      try {
        if (tag != null && tag != cur) {
          await _tts.setLanguage(tag);
          cur = tag;
        }
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
