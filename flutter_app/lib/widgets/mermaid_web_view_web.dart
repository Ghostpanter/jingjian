import 'dart:convert';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import '../theme/app_theme.dart';
import 'mermaid_html.dart';

/// Web: render Mermaid in a sandboxed iframe (scripts only, no same-origin).
class MermaidIframe extends StatefulWidget {
  const MermaidIframe({super.key, required this.source});
  final String source;

  @override
  State<MermaidIframe> createState() => _MermaidIframeState();
}

int _seq = 0;

class _MermaidIframeState extends State<MermaidIframe> {
  late final String _viewType;
  late final String _token;
  web.HTMLIFrameElement? _frame;
  double _height = 160;
  JSFunction? _listener;
  String _renderedKey = '';
  String get _themeKey => '${JingjianColors.cssHex(JingjianColors.paper)}${JingjianColors.dark}';

  @override
  void initState() {
    super.initState();
    _token = 'jjm${++_seq}';
    _viewType = 'jingjian-mermaid-$_token';
    ui_web.platformViewRegistry.registerViewFactory(_viewType, (int _) {
      final f = web.document.createElement('iframe') as web.HTMLIFrameElement;
      f.style.border = '0';
      f.style.width = '100%';
      f.style.height = '100%';
      f.setAttribute('sandbox', 'allow-scripts');
      _frame = f;
      _render();
      return f;
    });
    _listener = ((web.MessageEvent e) {
      final d = e.data;
      if (d == null || !d.isA<JSString>()) return;
      final s = (d as JSString).toDart;
      if (!s.startsWith('$_token:')) return;
      final body = s.substring(_token.length + 1);
      if (body.startsWith('w:')) {
        final dy = double.tryParse(body.substring(2));
        final pos = mounted ? Scrollable.maybeOf(context)?.position : null;
        if (dy != null && pos != null) {
          pos.jumpTo((pos.pixels + dy).clamp(pos.minScrollExtent, pos.maxScrollExtent));
        }
        return;
      }
      final h = double.tryParse(body.startsWith('h:') ? body.substring(2) : body);
      if (h != null && h > 24 && mounted && (h - _height).abs() > 1) setState(() => _height = h);
    }).toJS;
    web.window.addEventListener('message', _listener);
  }

  @override
  void didUpdateWidget(covariant MermaidIframe old) {
    super.didUpdateWidget(old);
    if (old.source != widget.source) _render();
  }

  @override
  void dispose() {
    if (_listener != null) web.window.removeEventListener('message', _listener);
    super.dispose();
  }

  void _render() {
    final f = _frame;
    if (f == null) return;
    final bg = JingjianColors.cssHex(JingjianColors.paper);
    final fg = JingjianColors.cssHex(JingjianColors.ink);
    final dark = JingjianColors.dark;
    final base = Uri.base.resolve('assets/assets/preview/mermaid.min.js').toString();
    f.srcdoc = buildMermaidHtml(
      source: widget.source,
      scriptTag: '<script src="$base"></script>',
      postJs: 'parent.postMessage(${jsonEncode(_token)} + ":" + msg, "*");',
      bg: bg,
      fg: fg,
      muted: JingjianColors.cssHex(JingjianColors.muted),
      dark: dark,
      forwardWheel: true,
    ).toJS;
    _renderedKey = _themeKey;
  }

  @override
  Widget build(BuildContext context) {
    // Theme switch (incl. OLED/light) rebuilds us; re-render with new colors.
    if (_renderedKey.isNotEmpty && _renderedKey != _themeKey) {
      WidgetsBinding.instance.addPostFrameCallback((_) { if (mounted) _render(); });
      _renderedKey = _themeKey;
    }
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      height: _height,
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: JingjianColors.paper,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: JingjianColors.border),
      ),
      child: HtmlElementView(viewType: _viewType),
    );
  }
}
