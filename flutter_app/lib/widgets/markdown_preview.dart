import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_math_fork/flutter_math.dart';
import 'package:markdown/markdown.dart' as md;
import 'package:url_launcher/url_launcher.dart';

import '../services/image_store.dart';
import '../services/preview_blocks.dart';
import '../theme/app_theme.dart';
import 'mermaid_block.dart';

/// `$...$` inline math inside a paragraph (kept in-line, not split into blocks).
class _InlineMathSyntax extends md.InlineSyntax {
  _InlineMathSyntax() : super(r'(?<![\\$])\$(?!\s)([^\n$]+?)(?<!\s)\$(?!\d)');

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    parser.addNode(md.Element.text('imath', match[1]!));
    return true;
  }
}

/// `[[Note]]` / `[[Note|alias]]` → link with `wiki:` scheme.
class _WikiSyntax extends md.InlineSyntax {
  _WikiSyntax() : super(r'!?\[\[([^\]|#]+?)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]');

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    final target = match[1]!.trim();
    final el = md.Element.text('a', (match[2] ?? target).trim());
    el.attributes['href'] = 'wiki:${Uri.encodeComponent(target)}';
    parser.addNode(el);
    return true;
  }
}

class _InlineMathBuilder extends MarkdownElementBuilder {
  _InlineMathBuilder(this.size);
  final double size;

  @override
  Widget? visitElementAfterWithContext(
      BuildContext context, md.Element element, TextStyle? preferredStyle, TextStyle? parentStyle) {
    final tex = element.textContent;
    return Math.tex(
      tex,
      mathStyle: MathStyle.text,
      textStyle: (parentStyle ?? const TextStyle()).copyWith(fontSize: size, color: JingjianColors.ink),
      onErrorFallback: (_) => Text('\$$tex\$', style: TextStyle(color: JingjianColors.danger)),
    );
  }
}

class MarkdownPreview extends StatelessWidget {
  const MarkdownPreview({super.key, required this.content, this.onWikiTap, this.plain = false});
  final String content;
  final void Function(String target)? onWikiTap;
  final bool plain;

  Widget _image(MarkdownImageConfig c) {
    final uri = c.uri;
    final s = uri.toString();
    Widget err() => Text('[图片：${c.alt ?? s}]', style: TextStyle(color: JingjianColors.muted));
    if (uri.scheme == 'http' || uri.scheme == 'https') {
      return Image.network(s, errorBuilder: (_, _, _) => err());
    }
    if (uri.scheme == 'data') {
      final data = uri.data;
      if (data != null) return Image.memory(data.contentAsBytes(), errorBuilder: (_, _, _) => err());
    }
    if (kIsWeb) return err();
    final file = s.startsWith('images/') || s.startsWith('./images/') || s.startsWith('jingjian-img://')
        ? ImageStore.instance.fileForIdSync(
            s.replaceFirst(RegExp(r'^(\./)?images/|^jingjian-img://'), '').replaceFirst(RegExp(r'\.[a-z0-9]+$', caseSensitive: false), ''))
        : (uri.scheme == 'file' ? File(uri.toFilePath()) : null);
    if (file == null) return err();
    return Image.file(file, width: c.width, height: c.height, errorBuilder: (_, _, _) => err());
  }

  Future<void> _tap(String? href) async {
    if (href == null) return;
    if (href.startsWith('wiki:')) {
      onWikiTap?.call(Uri.decodeComponent(href.substring(5)));
      return;
    }
    final uri = Uri.tryParse(href);
    if (uri != null && (uri.scheme == 'http' || uri.scheme == 'https' || uri.scheme == 'mailto')) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = ThemeController.instance;
    final base = theme.fontSize;
    if (plain) {
      return Container(
        color: JingjianColors.paper,
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
          child: SelectableText(content,
              style: TextStyle(fontSize: base, height: 1.7, color: JingjianColors.ink, fontFamily: theme.fontFamily)),
        ),
      );
    }
    final blocks = splitPreviewBlocks(content, splitInlineMath: false);
    final sheet = MarkdownStyleSheet.fromTheme(Theme.of(context)).copyWith(
      p: TextStyle(fontSize: base, height: 1.7, color: JingjianColors.ink, fontFamily: theme.fontFamily),
      listBullet: TextStyle(fontSize: base, color: JingjianColors.ink),
      tableBody: TextStyle(fontSize: base * .92, color: JingjianColors.ink),
      tableHead: TextStyle(fontSize: base * .92, fontWeight: FontWeight.w600, color: JingjianColors.ink),
      tableBorder: TableBorder.all(color: JingjianColors.border),
      h1: TextStyle(fontSize: base * 1.6, fontWeight: FontWeight.w600, height: 1.3, color: JingjianColors.ink),
      h2: TextStyle(fontSize: base * 1.35, fontWeight: FontWeight.w600, height: 1.3, color: JingjianColors.ink),
      h3: TextStyle(fontSize: base * 1.15, fontWeight: FontWeight.w600, height: 1.35, color: JingjianColors.ink),
      h4: TextStyle(fontSize: base, fontWeight: FontWeight.w600, color: JingjianColors.ink),
      code: TextStyle(
        backgroundColor: JingjianColors.overlay,
        fontFamily: 'monospace',
        fontSize: base * .88,
        color: JingjianColors.ink,
      ),
      codeblockDecoration: BoxDecoration(
        color: JingjianColors.overlay,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: JingjianColors.border),
      ),
      blockquote: TextStyle(color: JingjianColors.muted, fontSize: base),
      blockquoteDecoration: BoxDecoration(
        border: Border(left: BorderSide(color: JingjianColors.accent, width: 3)),
      ),
      horizontalRuleDecoration: BoxDecoration(border: Border(top: BorderSide(color: JingjianColors.border))),
      a: TextStyle(color: JingjianColors.accent, decoration: TextDecoration.underline, decorationColor: JingjianColors.accent),
      checkbox: TextStyle(color: JingjianColors.accent),
    );
    if (blocks.isEmpty) return Container(color: JingjianColors.paper);
    return Container(
      color: JingjianColors.paper,
      child: ListView.builder(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        itemCount: blocks.length,
        itemBuilder: (context, index) {
          final b = blocks[index];
          switch (b.kind) {
            case PreviewBlockKind.markdown:
              return MarkdownBody(
                data: b.text,
                selectable: true,
                styleSheet: sheet,
                extensionSet: md.ExtensionSet.gitHubFlavored,
                inlineSyntaxes: [_WikiSyntax(), _InlineMathSyntax()],
                builders: {'imath': _InlineMathBuilder(base)},
                sizedImageBuilder: _image,
                onTapLink: (_, href, _) => _tap(href),
              );
            case PreviewBlockKind.math:
              return Padding(
                padding: EdgeInsets.symmetric(vertical: b.displayMath ? 10 : 2),
                child: SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Math.tex(
                    b.text,
                    mathStyle: b.displayMath ? MathStyle.display : MathStyle.text,
                    textStyle: TextStyle(fontSize: base, color: JingjianColors.ink),
                    onErrorFallback: (err) => SelectableText(
                      b.displayMath ? '\$\$${b.text}\$\$' : '\$${b.text}\$',
                      style: TextStyle(color: JingjianColors.danger, fontFamily: 'monospace'),
                    ),
                  ),
                ),
              );
            case PreviewBlockKind.mermaid:
              return MermaidBlock(source: b.text);
          }
        },
      ),
    );
  }
}
