import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:webview_flutter/webview_flutter.dart';

import '../theme/app_theme.dart';
import 'mermaid_html.dart';
import 'mermaid_web_view.dart';

/// webview_flutter only exists on Android/iOS/macOS. Web uses an iframe;
/// Linux/Windows show the diagram source instead of crashing.
bool get mermaidWebViewSupported =>
    !kIsWeb &&
    (defaultTargetPlatform == TargetPlatform.android ||
        defaultTargetPlatform == TargetPlatform.iOS ||
        defaultTargetPlatform == TargetPlatform.macOS);

class MermaidBlock extends StatelessWidget {
  const MermaidBlock({super.key, required this.source});
  final String source;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb) return MermaidIframe(source: source);
    if (mermaidWebViewSupported) return _MermaidWebView(source: source);
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 8),
      padding: const EdgeInsets.all(10),
      width: double.infinity,
      decoration: BoxDecoration(
        color: JingjianColors.paper,
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: JingjianColors.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text('Mermaid 图（此平台不能渲染，导出 HTML/PDF 或在手机上查看）',
            style: TextStyle(fontSize: 12, color: JingjianColors.muted)),
        const SizedBox(height: 6),
        SelectableText(source, style: const TextStyle(fontFamily: 'monospace', fontSize: 13)),
      ]),
    );
  }
}

class _MermaidWebView extends StatefulWidget {
  const _MermaidWebView({required this.source});
  final String source;

  @override
  State<_MermaidWebView> createState() => _MermaidBlockState();
}

class _MermaidBlockState extends State<_MermaidWebView> {
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
          final m = msg.message;
          if (!m.startsWith('h:')) return;
          final h = double.tryParse(m.substring(2));
          if (h != null && h > 24 && mounted && (h - _height).abs() > 1) setState(() => _height = h);
        },
      );
    _load();
  }

  @override
  void didUpdateWidget(covariant _MermaidWebView oldWidget) {
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
    // Android: reference the asset by URL. Inlining the 2.6 MB script made the
    // page exceed WebView's data-URL limit, so `mermaid` was never defined.
    final android = defaultTargetPlatform == TargetPlatform.android;
    final local = android ? '' : await _mermaidJs();
    final scriptTag = android
        ? mermaidScriptTag('${androidAssetBase}mermaid.min.js')
        : local.isNotEmpty
            ? '<script>${local.replaceAll('</', r'<\/')}</script>'
            : mermaidScriptTag(mermaidCdn);
    final html = buildMermaidHtml(
      source: widget.source,
      scriptTag: scriptTag,
      postJs: 'JingjianHeight.postMessage(msg);',
      bg: bg,
      fg: fg,
      muted: JingjianColors.cssHex(JingjianColors.muted),
      dark: dark,
    );
    await _controller.loadHtmlString(
      html,
      baseUrl: android ? androidAssetBase : (local.isNotEmpty ? null : 'https://cdn.jsdelivr.net/'),
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
