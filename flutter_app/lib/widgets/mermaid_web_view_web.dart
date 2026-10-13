import 'dart:convert';
import 'dart:js_interop';
import 'dart:ui_web' as ui_web;

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

import '../theme/app_theme.dart';

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
      final h = double.tryParse(s.substring(_token.length + 1));
      if (h != null && h > 40 && mounted) setState(() => _height = h + 16);
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
    f.srcdoc = '''
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<script src="$base"></script>
<style>html,body{margin:0;padding:8px;background:$bg;color:$fg;font-family:sans-serif}.mermaid{display:flex;justify-content:center}</style>
</head><body><div class="mermaid" id="m"></div><script>
const post = (h) => parent.postMessage(${jsonEncode(_token)} + ':' + h, '*');
try {
  mermaid.initialize({startOnLoad:false,theme:'${dark ? 'dark' : 'neutral'}',securityLevel:'strict'});
  document.getElementById('m').textContent = ${jsonEncode(widget.source)};
  mermaid.run({nodes:[document.getElementById('m')]}).then(() => post(document.documentElement.scrollHeight)).catch(() => post(80));
} catch (e) { document.body.textContent = 'Mermaid 渲染失败'; post(80); }
</script></body></html>'''.toJS;
  }

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      height: _height,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: JingjianColors.border),
      ),
      child: HtmlElementView(viewType: _viewType),
    );
  }
}
