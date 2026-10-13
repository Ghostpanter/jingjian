import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme/app_theme.dart';

class MermaidBlock extends StatefulWidget {
  const MermaidBlock({super.key, required this.source});
  final String source;

  @override
  State<MermaidBlock> createState() => _MermaidBlockState();
}

class _MermaidBlockState extends State<MermaidBlock> {
  late final WebViewController _controller;
  double _height = 160;
  String _loadedKey = '';
  static String? _cachedMermaidJs;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(JingjianColors.paper)
      ..addJavaScriptChannel(
        'JingjianHeight',
        onMessageReceived: (msg) {
          final h = double.tryParse(msg.message);
          if (h != null && h > 40 && mounted) setState(() => _height = h + 16);
        },
      );
    _load();
  }

  @override
  void didUpdateWidget(covariant MermaidBlock oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.source != widget.source) _load();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Theme switch (incl. OLED) rebuilds us; re-render if colors changed.
    if (_loadedKey.isNotEmpty && _loadedKey != _themeKey) _load();
  }

  String get _themeKey => '${JingjianColors.cssHex(JingjianColors.paper)}${JingjianColors.dark}';

  Future<String> _mermaidJs() async {
    if (_cachedMermaidJs != null) return _cachedMermaidJs!;
    try {
      _cachedMermaidJs = await rootBundle.loadString('assets/preview/mermaid.min.js');
    } catch (_) {
      _cachedMermaidJs = '';
    }
    return _cachedMermaidJs!;
  }

  Future<void> _load() async {
    _loadedKey = _themeKey;
    final bg = JingjianColors.cssHex(JingjianColors.paper);
    final fg = JingjianColors.cssHex(JingjianColors.ink);
    final dark = JingjianColors.dark;
    _controller.setBackgroundColor(JingjianColors.paper);
    final src = jsonEncode(widget.source);
    final local = await _mermaidJs();
    final scriptTag = local.isNotEmpty
        ? '<script>${local.replaceAll('</', r'<\/')}</script>'
        : '<script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>';
    final html = '''
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
$scriptTag
<style>html,body{margin:0;padding:8px;background:$bg;color:$fg;font-family:sans-serif}.mermaid{display:flex;justify-content:center}</style>
</head><body>
<div class="mermaid" id="m"></div>
<script>
mermaid.initialize({startOnLoad:false,theme:'${dark ? 'dark' : 'neutral'}',securityLevel:'strict',themeVariables:{background:'$bg'}});
const source = $src;
document.getElementById('m').textContent = source;
mermaid.run({nodes:[document.getElementById('m')]}).then(()=>{
  const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
  JingjianHeight.postMessage(String(h));
}).catch(()=>{ JingjianHeight.postMessage('80'); });
</script></body></html>
''';
    await _controller.loadHtmlString(
      html,
      baseUrl: local.isNotEmpty ? null : 'https://cdn.jsdelivr.net/',
    );
  }

  @override
  Widget build(BuildContext context) {
    if (_loadedKey.isNotEmpty && _loadedKey != _themeKey) {
      _loadedKey = _themeKey;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) _load();
      });
    }
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: JingjianColors.paper,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: JingjianColors.border),
      ),
      height: _height,
      child: WebViewWidget(controller: _controller),
    );
  }
}
