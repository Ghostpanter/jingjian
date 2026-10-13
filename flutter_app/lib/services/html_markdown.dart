/// Small HTML → Markdown converter for ebook chapters (headings, paragraphs,
/// emphasis, lists, images, links, blockquotes). Good enough for book text.
String htmlToMarkdown(String html, {String Function(String src)? imageSrc}) {
  var s = html
      .replaceAll(RegExp(r'<(script|style|head)[\s\S]*?</\1>', caseSensitive: false), '')
      .replaceAll(RegExp(r'<!--[\s\S]*?-->'), '')
      .replaceAll(RegExp(r'\r\n?'), '\n');
  s = s.replaceAllMapped(
      RegExp(r'<h([1-6])[^>]*>([\s\S]*?)</h\1>', caseSensitive: false),
      (m) => '\n\n${'#' * int.parse(m[1]!)} ${_inline(m[2]!).trim()}\n\n');
  s = s.replaceAllMapped(RegExp(r'<img\b[^>]*>', caseSensitive: false), (m) {
    final tag = m[0]!;
    final src = RegExp(r'''(?:src|xlink:href|l:href)\s*=\s*["']([^"']+)["']''', caseSensitive: false)
            .firstMatch(tag)
            ?.group(1) ??
        '';
    if (src.isEmpty) return '';
    final alt = RegExp(r'''alt\s*=\s*["']([^"']*)["']''', caseSensitive: false).firstMatch(tag)?.group(1) ?? '';
    final mapped = imageSrc != null ? imageSrc(src) : src;
    return mapped.isEmpty ? '' : '\n\n![$alt]($mapped)\n\n';
  });
  s = s.replaceAllMapped(RegExp(r'<blockquote[^>]*>([\s\S]*?)</blockquote>', caseSensitive: false),
      (m) => '\n\n${_inline(m[1]!).trim().split('\n').map((l) => '> $l').join('\n')}\n\n');
  s = s.replaceAllMapped(RegExp(r'<li[^>]*>([\s\S]*?)</li>', caseSensitive: false),
      (m) => '\n- ${_inline(m[1]!).trim()}');
  s = s.replaceAll(RegExp(r'</?(ul|ol)[^>]*>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'<(br|mbp:pagebreak)\s*/?>', caseSensitive: false), '\n');
  s = s.replaceAll(RegExp(r'<hr\s*/?>', caseSensitive: false), '\n\n---\n\n');
  s = s.replaceAll(RegExp(r'</(p|div|section|tr|table)>', caseSensitive: false), '\n\n');
  s = _inline(s);
  s = s.replaceAll(RegExp(r'<[^>]+>'), '');
  s = decodeEntities(s);
  s = s
      .split('\n')
      .map((l) => l.replaceAll(RegExp(r'[ \t\u00a0]+'), ' ').trimRight())
      .join('\n')
      .replaceAll(RegExp(r'\n{3,}'), '\n\n');
  return s.trim();
}

String _inline(String s) => s
    .replaceAllMapped(RegExp(r'<(strong|b)\b[^>]*>([\s\S]*?)</\1>', caseSensitive: false),
        (m) => m[2]!.trim().isEmpty ? m[2]! : '**${m[2]!.trim()}**')
    .replaceAllMapped(RegExp(r'<(em|i)\b[^>]*>([\s\S]*?)</\1>', caseSensitive: false),
        (m) => m[2]!.trim().isEmpty ? m[2]! : '*${m[2]!.trim()}*')
    .replaceAllMapped(RegExp(r'''<a\b[^>]*href=["'](https?:[^"']+)["'][^>]*>([\s\S]*?)</a>''', caseSensitive: false),
        (m) => '[${m[2]!.replaceAll(RegExp(r'<[^>]+>'), '')}](${m[1]})');

String decodeEntities(String s) => s
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAllMapped(RegExp(r'&#x([0-9a-f]+);', caseSensitive: false),
        (m) => String.fromCharCode(int.parse(m[1]!, radix: 16)))
    .replaceAllMapped(RegExp(r'&#(\d+);'), (m) => String.fromCharCode(int.parse(m[1]!)))
    .replaceAll('&amp;', '&');
