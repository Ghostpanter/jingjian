enum PreviewBlockKind { markdown, math, mermaid }

class PreviewBlock {
  const PreviewBlock(this.kind, this.text, {this.displayMath = false});
  final PreviewBlockKind kind;
  final String text;
  final bool displayMath;
}

/// Split source into markdown / math / mermaid fence blocks for native render.
List<PreviewBlock> splitPreviewBlocks(String source) {
  final blocks = <PreviewBlock>[];
  final lines = source.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  final md = StringBuffer();
  var i = 0;

  void flushMd() {
    final t = md.toString();
    if (t.trim().isEmpty) {
      md.clear();
      return;
    }
    blocks.add(PreviewBlock(PreviewBlockKind.markdown, t));
    md.clear();
  }

  while (i < lines.length) {
    final line = lines[i];
    final fence = RegExp(r'^(\s*)(`{3,}|~{3,})\s*(\w*)\s*$').firstMatch(line);
    if (fence != null) {
      final mark = fence.group(2)!;
      final lang = (fence.group(3) ?? '').toLowerCase();
      final body = StringBuffer();
      i += 1;
      while (i < lines.length) {
        final close = RegExp(r'^\s*' + RegExp.escape(mark) + r'\s*$').hasMatch(lines[i]);
        if (close) break;
        if (body.isNotEmpty) body.writeln();
        body.write(lines[i]);
        i += 1;
      }
      flushMd();
      if (lang == 'mermaid') {
        blocks.add(PreviewBlock(PreviewBlockKind.mermaid, body.toString()));
      } else {
        // Keep as markdown fence (flutter_markdown handles code)
        md.writeln(line);
        md.write(body);
        if (body.isNotEmpty) md.writeln();
        md.writeln(mark);
      }
      i += 1;
      continue;
    }

    // Display math $$ ... $$
    if (line.trim().startsWith(r'$$')) {
      flushMd();
      final buf = StringBuffer();
      final same = line.trim();
      if (same.length > 4 && same.endsWith(r'$$')) {
        blocks.add(PreviewBlock(
          PreviewBlockKind.math,
          same.substring(2, same.length - 2).trim(),
          displayMath: true,
        ));
        i += 1;
        continue;
      }
      if (same == r'$$') {
        i += 1;
        while (i < lines.length && lines[i].trim() != r'$$') {
          if (buf.isNotEmpty) buf.writeln();
          buf.write(lines[i]);
          i += 1;
        }
        blocks.add(PreviewBlock(PreviewBlockKind.math, buf.toString().trim(), displayMath: true));
        i += 1;
        continue;
      }
    }

    if (md.isNotEmpty) md.writeln();
    md.write(line);
    i += 1;
  }
  flushMd();

  // Split inline $...$ out of markdown blocks into alternating pieces
  final refined = <PreviewBlock>[];
  final inline = RegExp(r'(^|[^\\\$])\$([^\n\$]+?)\$');
  for (final b in blocks) {
    if (b.kind != PreviewBlockKind.markdown) {
      refined.add(b);
      continue;
    }
    var text = b.text;
    var start = 0;
    for (final m in inline.allMatches(text)) {
      final preEnd = m.start + (m.group(1)?.length ?? 0);
      if (preEnd > start) {
        refined.add(PreviewBlock(PreviewBlockKind.markdown, text.substring(start, preEnd)));
      }
      refined.add(PreviewBlock(PreviewBlockKind.math, m.group(2)!.trim(), displayMath: false));
      start = m.end;
    }
    if (start < text.length) {
      refined.add(PreviewBlock(PreviewBlockKind.markdown, text.substring(start)));
    }
  }
  return refined.where((b) => b.kind != PreviewBlockKind.markdown || b.text.trim().isNotEmpty).toList();
}
