import 'package:flutter/material.dart';

import '../services/link_graph.dart';
import '../services/note_store.dart';
import '../theme/app_theme.dart';
import 'editor_screen.dart';

class GraphScreen extends StatefulWidget {
  const GraphScreen({super.key, this.focusId});
  final String? focusId;

  @override
  State<GraphScreen> createState() => _GraphScreenState();
}

class _GraphScreenState extends State<GraphScreen> {
  late LinkGraph _graph;
  List<GraphPoint> _points = [];
  Size _size = Size.zero;

  @override
  void initState() {
    super.initState();
    _rebuild();
  }

  void _rebuild() {
    final notes = NoteStore.instance.notes
        .map((n) => (id: n.id, content: n.content))
        .toList();
    _graph = linkGraph(notes, focusId: widget.focusId);
  }

  void _layout(Size size) {
    if (size == _size && _points.isNotEmpty) return;
    _size = size;
    _points = layoutGraph(_graph.nodes, _graph.links, size.width, size.height);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text(_graph.truncated ? '图谱（${_graph.nodes.length}/${_graph.total}）' : '笔记图谱'),
      ),
      body: LayoutBuilder(
        builder: (context, constraints) {
          _layout(Size(constraints.maxWidth, constraints.maxHeight));
          return GestureDetector(
            onTapUp: (d) {
              GraphPoint? hit;
              for (final p in _points) {
                if ((Offset(p.x, p.y) - d.localPosition).distance < 22) {
                  hit = p;
                  break;
                }
              }
              if (hit == null) return;
              Navigator.of(context).push(
                MaterialPageRoute(
                  builder: (_) => EditorScreen(
                    noteId: hit!.id,
                    onChanged: () => setState(_rebuild),
                  ),
                ),
              );
            },
            child: CustomPaint(
              size: Size(constraints.maxWidth, constraints.maxHeight),
              painter: _GraphPainter(_graph, _points),
            ),
          );
        },
      ),
    );
  }
}

class _GraphPainter extends CustomPainter {
  _GraphPainter(this.graph, this.points);
  final LinkGraph graph;
  final List<GraphPoint> points;

  @override
  void paint(Canvas canvas, Size size) {
    final byId = {for (final p in points) p.id: p};
    final linkPaint = Paint()
      ..color = JingjianColors.border
      ..strokeWidth = 1.2;
    for (final link in graph.links) {
      final a = byId[link.source];
      final b = byId[link.target];
      if (a == null || b == null) continue;
      canvas.drawLine(Offset(a.x, a.y), Offset(b.x, b.y), linkPaint);
    }
    final nodePaint = Paint()..color = JingjianColors.accent;
    final textPainter = TextPainter(textDirection: TextDirection.ltr);
    for (final node in graph.nodes) {
      final p = byId[node.id];
      if (p == null) continue;
      final r = 8.0 + (node.degree.clamp(0, 8) * 1.2);
      canvas.drawCircle(Offset(p.x, p.y), r, nodePaint);
      textPainter.text = TextSpan(
        text: node.title.length > 10 ? '${node.title.substring(0, 10)}…' : node.title,
        style: const TextStyle(fontSize: 11, color: JingjianColors.ink),
      );
      textPainter.layout(maxWidth: 100);
      textPainter.paint(canvas, Offset(p.x - textPainter.width / 2, p.y + r + 2));
    }
  }

  @override
  bool shouldRepaint(covariant _GraphPainter oldDelegate) => true;
}
