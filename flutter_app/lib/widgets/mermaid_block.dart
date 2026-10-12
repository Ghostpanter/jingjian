import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

class MermaidBlock extends StatefulWidget {
  const MermaidBlock({super.key, required this.source});
  final String source;

  @override
  State<MermaidBlock> createState() => _MermaidBlockState();
}

class _MermaidBlockState extends State<MermaidBlock> {
  late final WebViewController _controller;
  double _height = 160;
  static String? _cachedMermaidJs;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(Colors.white)
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
    final src = jsonEncode(widget.source);
    final local = await _mermaidJs();
    final scriptTag = local.isNotEmpty
        ? '<script>${local.replaceAll('</', r'<\/')}</script>'
        : '<script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>';
    final html = '''
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
$scriptTag
<style>body{margin:8px;background:#fff;font-family:sans-serif}.mermaid{display:flex;justify-content:center}</style>
</head><body>
<div class="mermaid" id="m"></div>
<script>
mermaid.initialize({startOnLoad:false,theme:'neutral',securityLevel:'loose'});
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
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: const Color(0xFFD4CBBC)),
      ),
      height: _height,
      child: WebViewWidget(controller: _controller),
    );
  }
}
