import 'dart:convert';

import 'package:flutter/material.dart';
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

  Future<void> _load() async {
    final src = jsonEncode(widget.source);
    final html = '''
<!DOCTYPE html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<script src="https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js"></script>
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
    await _controller.loadHtmlString(html, baseUrl: 'https://cdn.jsdelivr.net/');
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
