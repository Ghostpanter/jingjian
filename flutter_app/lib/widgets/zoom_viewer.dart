import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

/// Full-screen pan / pinch-zoom viewer (used for formulas). Double-tap
/// toggles 2× / fit; ＋ － 复位 in the app bar; ctrl+滚轮 zooms on desktop.
class ZoomViewerPage extends StatefulWidget {
  const ZoomViewerPage({super.key, required this.title, required this.child});
  final String title;
  final Widget child;

  static void open(BuildContext context, {required String title, required Widget child}) =>
      Navigator.of(context).push(MaterialPageRoute(fullscreenDialog: true, builder: (_) => ZoomViewerPage(title: title, child: child)));

  @override
  State<ZoomViewerPage> createState() => ZoomViewerPageState();
}

class ZoomViewerPageState extends State<ZoomViewerPage> {
  final ctl = TransformationController();
  Offset _tap = Offset.zero;
  Size _size = Size.zero;

  double get scale => ctl.value.getMaxScaleOnAxis();

  void zoomBy(double f, [Offset? at]) {
    final c = at ?? _size.center(Offset.zero);
    final n = (scale * f).clamp(0.5, 8.0) / scale;
    ctl.value = Matrix4.identity()
      ..translateByDouble(c.dx, c.dy, 0, 1)
      ..scaleByDouble(n, n, 1, 1)
      ..translateByDouble(-c.dx, -c.dy, 0, 1)
      ..multiply(ctl.value);
  }

  void reset() => ctl.value = Matrix4.identity();

  @override
  void dispose() {
    ctl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: JingjianColors.paper,
        appBar: AppBar(
          backgroundColor: JingjianColors.paper,
          title: Text(widget.title),
          actions: [
            IconButton(tooltip: '放大', icon: const Icon(Icons.zoom_in), onPressed: () => zoomBy(1.4)),
            IconButton(tooltip: '缩小', icon: const Icon(Icons.zoom_out), onPressed: () => zoomBy(1 / 1.4)),
            IconButton(tooltip: '复位', icon: const Icon(Icons.center_focus_strong_outlined), onPressed: reset),
          ],
        ),
        body: LayoutBuilder(builder: (context, c) {
          _size = c.biggest;
          return GestureDetector(
            onDoubleTapDown: (d) => _tap = d.localPosition,
            onDoubleTap: () => scale > 1.05 ? reset() : zoomBy(2, _tap),
            child: InteractiveViewer(
              transformationController: ctl,
              minScale: 0.5,
              maxScale: 8,
              boundaryMargin: const EdgeInsets.all(double.infinity),
              constrained: false,
              child: ConstrainedBox(
                constraints: BoxConstraints(minWidth: c.maxWidth, minHeight: c.maxHeight),
                child: Center(child: Padding(padding: const EdgeInsets.all(24), child: widget.child)),
              ),
            ),
          );
        }),
      );
}
