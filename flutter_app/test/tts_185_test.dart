import 'package:flutter_test/flutter_test.dart';
import 'package:jingjian/services/tts_service.dart';

void main() {
  test('long text is chunked below Android 4000-char limit, at sentence ends, losslessly', () {
    final text = List.generate(800, (i) => '第$i句话很长很长。').join();
    final parts = TtsService.chunks(text);
    expect(parts.length, greaterThan(1));
    expect(parts.every((p) => p.length <= 3000), isTrue);
    expect(parts.take(parts.length - 1).every((p) => p.endsWith('。')), isTrue);
    expect(parts.join(), text);
  });
  test('no separators still splits', () {
    final parts = TtsService.chunks('字' * 7000);
    expect(parts.map((p) => p.length), [3000, 3000, 1000]);
  });
  test('short text is one chunk; empty is none', () {
    expect(TtsService.chunks('你好'), ['你好']);
    expect(TtsService.chunks('  '), isEmpty);
  });
  test('language fallback picks an available Chinese voice or default', () {
    expect(TtsService.pickLanguage('zh-CN', (l) => l == 'zh-CN'), 'zh-CN');
    expect(TtsService.pickLanguage('zh-CN', (l) => l == 'zh-TW'), 'zh-TW');
    expect(TtsService.pickLanguage('en-US', (l) => l == 'zh'), 'zh');
    expect(TtsService.pickLanguage('zh-CN', (l) => false), isNull);
  });
  test('markdown is stripped before speaking', () {
    expect(TtsService.speakable('# 标题\n```js\nx\n```\n[链接](http://a) **粗**'), '标题\n \n链接 粗');
  });
}
