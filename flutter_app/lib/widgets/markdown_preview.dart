import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_math_fork/flutter_math.dart';

import '../services/preview_blocks.dart';
import '../theme/app_theme.dart';
import 'mermaid_block.dart';

class MarkdownPreview extends StatelessWidget {
  const MarkdownPreview({super.key, required this.content});
  final String content;

  @override
  Widget build(BuildContext context) {
    final blocks = splitPreviewBlocks(content);
    if (blocks.isEmpty) {
      return const SizedBox.expand();
    }
    return ListView.builder(
      padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
      itemCount: blocks.length,
      itemBuilder: (context, index) {
        final b = blocks[index];
        switch (b.kind) {
          case PreviewBlockKind.markdown:
            return MarkdownBody(
              data: b.text,
              selectable: true,
              styleSheet: MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
                p: const TextStyle(fontSize: 16, height: 1.65, color: JingjianColors.ink),
                h1: const TextStyle(fontSize: 26, fontWeight: FontWeight.w600, height: 1.3),
                h2: const TextStyle(fontSize: 22, fontWeight: FontWeight.w600, height: 1.3),
                h3: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600, height: 1.35),
                code: TextStyle(
                  backgroundColor: JingjianColors.overlay,
                  fontFamily: 'monospace',
                  fontSize: 14,
                  color: JingjianColors.ink,
                ),
                codeblockDecoration: BoxDecoration(
                  color: JingjianColors.overlay,
                  borderRadius: BorderRadius.circular(8),
                ),
                blockquoteDecoration: const BoxDecoration(
                  border: Border(left: BorderSide(color: JingjianColors.accent, width: 3)),
                ),
                a: const TextStyle(color: JingjianColors.accent),
              ),
            );
          case PreviewBlockKind.math:
            try {
              return Padding(
                padding: EdgeInsets.symmetric(vertical: b.displayMath ? 10 : 2),
                child: Math.tex(
                  b.text,
                  mathStyle: b.displayMath ? MathStyle.display : MathStyle.text,
                  textStyle: const TextStyle(fontSize: 16, color: JingjianColors.ink),
                  onErrorFallback: (err) => SelectableText(
                    b.displayMath ? '\$\$${b.text}\$\$' : '\$${b.text}\$',
                    style: const TextStyle(color: JingjianColors.danger, fontFamily: 'monospace'),
                  ),
                ),
              );
            } catch (_) {
              return SelectableText(b.text);
            }
          case PreviewBlockKind.mermaid:
            return MermaidBlock(source: b.text);
        }
      },
    );
  }
}
