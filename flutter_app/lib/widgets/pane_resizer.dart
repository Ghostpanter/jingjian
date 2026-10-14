import 'package:flutter/gestures.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../theme/app_theme.dart';

/// Pure snap rules (unit-tested).
class PaneSnap {
  /// Released narrower than 60% of the minimum → collapse.
  static bool collapses(double raw, double min) => raw < min * 0.6;

  /// Width the pane settles at after release (0 = collapsed).
  static double target(double raw, double min, double max) => collapses(raw, min) ? 0 : raw.clamp(min, max);

  /// Live width while the finger is down: follows 1:1, never negative / past max.
  static double live(double raw, double max) => raw.clamp(0, max);
}

/// A side pane with a draggable gutter on its right edge.
///
/// While dragging only this widget rebuilds (ValueNotifier), the content keeps
/// its minimum layout width and is clipped, so it doesn't reflow every frame.
/// On release it animates to the snapped width or collapses (haptic tick),
/// then [onCommit] persists the result once.
class ResizablePane extends StatefulWidget {
  const ResizablePane({
    super.key,
    required this.width,
    required this.collapsed,
    required this.min,
    required this.max,
    required this.onCommit,
    required this.onReset,
    required this.child,
  });
  final double width, min, max;
  final bool collapsed;
  final void Function(double width, bool collapsed) onCommit;
  final VoidCallback onReset;
  final Widget child;

  static const gutter = 20.0, collapsedGutter = 12.0;

  @override
  State<ResizablePane> createState() => _ResizablePaneState();
}

class _ResizablePaneState extends State<ResizablePane> with SingleTickerProviderStateMixin {
  late final ValueNotifier<double> _w = ValueNotifier(_resting);
  late final AnimationController _anim = AnimationController(vsync: this, duration: const Duration(milliseconds: 180));
  final ValueNotifier<bool> _active = ValueNotifier(false);
  double _raw = 0;
  bool _dragging = false, _wouldCollapse = false;

  double get _resting => widget.collapsed ? 0 : widget.width.clamp(widget.min, widget.max);

  @override
  void didUpdateWidget(covariant ResizablePane old) {
    super.didUpdateWidget(old);
    if (!_dragging && !_anim.isAnimating) _w.value = _resting; // buttons / reset / layout limits
  }

  @override
  void dispose() {
    _anim.dispose();
    _w.dispose();
    _active.dispose();
    super.dispose();
  }

  void _start(DragStartDetails _) {
    _anim.stop();
    _dragging = true;
    _active.value = true;
    _raw = _w.value;
    _wouldCollapse = PaneSnap.collapses(_raw, widget.min);
  }

  void _update(DragUpdateDetails d) {
    _raw += d.delta.dx;
    _w.value = PaneSnap.live(_raw, widget.max);
    final c = PaneSnap.collapses(_raw, widget.min);
    if (c != _wouldCollapse) {
      _wouldCollapse = c;
      HapticFeedback.selectionClick(); // crossed the collapse threshold
    }
  }

  void _end([DragEndDetails? _]) {
    _dragging = false;
    _active.value = false;
    final to = PaneSnap.target(_raw, widget.min, widget.max);
    final from = _w.value;
    if (to == 0) HapticFeedback.lightImpact();
    final tween = Tween(begin: from, end: to).chain(CurveTween(curve: Curves.easeOutCubic));
    void tick() => _w.value = tween.evaluate(_anim);
    _anim
      ..removeListener(tick)
      ..addListener(tick)
      ..forward(from: 0).whenComplete(() {
        _anim.removeListener(tick);
        if (!mounted) return;
        widget.onCommit(to == 0 ? widget.width : to, to == 0);
      });
  }

  @override
  Widget build(BuildContext context) {
    final content = RepaintBoundary(child: widget.child);
    return ValueListenableBuilder<double>(
      valueListenable: _w,
      builder: (context, w, _) {
        final layoutW = w < widget.min ? widget.min : w;
        return Row(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          if (w > 0.5)
            SizedBox(
              width: w,
              child: ClipRect(
                child: OverflowBox(
                  alignment: Alignment.topLeft,
                  minWidth: layoutW,
                  maxWidth: layoutW,
                  child: content,
                ),
              ),
            ),
          _Gutter(
            width: w > 0.5 ? ResizablePane.gutter : ResizablePane.collapsedGutter,
            active: _active,
            onStart: _start,
            onUpdate: _update,
            onEnd: _end,
            onReset: widget.onReset,
          ),
        ]);
      },
    );
  }
}

class _Gutter extends StatefulWidget {
  const _Gutter({required this.width, required this.active, required this.onStart, required this.onUpdate, required this.onEnd, required this.onReset});
  final double width;
  final ValueNotifier<bool> active;
  final GestureDragStartCallback onStart;
  final GestureDragUpdateCallback onUpdate;
  final GestureDragEndCallback onEnd;
  final VoidCallback onReset;

  @override
  State<_Gutter> createState() => _GutterState();
}

class _GutterState extends State<_Gutter> {
  bool _hover = false;

  @override
  Widget build(BuildContext context) => MouseRegion(
        cursor: SystemMouseCursors.resizeColumn,
        onEnter: (_) => setState(() => _hover = true),
        onExit: (_) => setState(() => _hover = false),
        child: GestureDetector(
          key: const ValueKey('pane-gutter'),
          behavior: HitTestBehavior.opaque,
          dragStartBehavior: DragStartBehavior.down, // follow the finger from touch-down, no jump
          onHorizontalDragStart: widget.onStart,
          onHorizontalDragUpdate: widget.onUpdate,
          onHorizontalDragEnd: widget.onEnd,
          onHorizontalDragCancel: () => widget.onEnd(DragEndDetails()),
          onDoubleTap: widget.onReset,
          child: Tooltip(
            message: '拖动调整宽度，拖到很窄松手会收起；双击恢复',
            waitDuration: const Duration(seconds: 1),
            child: ValueListenableBuilder<bool>(
              valueListenable: widget.active,
              builder: (context, drag, _) {
                final on = drag || _hover;
                return SizedBox(
                  width: widget.width,
                  child: Stack(alignment: Alignment.center, children: [
                    Container(width: 1, color: on ? JingjianColors.accent : JingjianColors.border),
                    AnimatedContainer(
                      duration: const Duration(milliseconds: 120),
                      width: on ? 6 : 4,
                      height: on ? 44 : 32,
                      decoration: BoxDecoration(
                        color: on ? JingjianColors.accent : JingjianColors.muted.withValues(alpha: 0.55),
                        borderRadius: BorderRadius.circular(3),
                      ),
                    ),
                  ]),
                );
              },
            ),
          ),
        ),
      );
}
