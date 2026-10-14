import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/tts_service.dart';

void main() {
  String langs(String t) => TtsService.segments(t).map((s) => s.$1).join(',');
  test('Chinese + English split, lossless', () {
    const t = '今天学习 Flutter framework 的用法。';
    final s = TtsService.segments(t);
    expect(s.map((e) => e.$1).toList(), ['zh', 'en', 'zh']);
    expect(s.map((e) => e.$2).join(), t);
  });
  test('short Latin stays with Chinese', () {
    expect(langs('导出 PDF 文件'), 'zh');
    expect(langs('A股上涨'), 'zh');
  });
  test('kanji next to kana is Japanese; hangul is Korean', () {
    expect(langs('日本語を勉強します'), 'ja');
    expect(langs('안녕하세요 世界'), contains('ko'));
  });
  test('pure English / Russian', () {
    expect(langs('Hello world, this is a test.'), 'en');
    expect(langs('Привет мир'), 'ru');
  });
  test('resolve handles engine tag variants', () {
    expect(TtsService.resolve('zh', ['en-US', 'zh-Hans-CN']), 'zh-Hans-CN');
    expect(TtsService.resolve('zh', ['cmn_CN']), 'cmn_CN');
    expect(TtsService.resolve('zh', ['zho-CHN']), 'zho-CHN');
    expect(TtsService.resolve('zh', ['zh-TW', 'zh-CN'], preferred: 'zh-TW'), 'zh-TW');
    expect(TtsService.resolve('en', ['en_GB']), 'en_GB');
    expect(TtsService.resolve('ja', ['en-US']), isNull);
  });
}
