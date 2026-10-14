import 'package:flutter/widgets.dart';

class MermaidIframe extends StatelessWidget {
  const MermaidIframe({super.key, required this.source, this.fullscreen = false, this.onFullscreen});
  final String source;
  final bool fullscreen;
  final VoidCallback? onFullscreen;
  @override
  Widget build(BuildContext context) => const SizedBox.shrink();
}
