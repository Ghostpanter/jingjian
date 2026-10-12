import 'dart:math' as math;

import 'note_file.dart';
import 'wiki_links.dart';

class GraphNode {
  GraphNode({required this.id, required this.title, required this.degree});
  final String id;
  final String title;
  final int degree;
}

class GraphLink {
  GraphLink(this.source, this.target);
  final String source;
  final String target;
}

class LinkGraph {
  LinkGraph({
    required this.nodes,
    required this.links,
    required this.truncated,
    required this.total,
  });
  final List<GraphNode> nodes;
  final List<GraphLink> links;
  final bool truncated;
  final int total;
}

class GraphPoint {
  GraphPoint(this.id, this.x, this.y);
  final String id;
  double x;
  double y;
}

const graphPage = 160;

LinkGraph linkGraph(
  List<({String id, String content})> notes, {
  int maxNodes = graphPage,
  String? focusId,
  int hops = 1,
}) {
  final titleOf = <String, String>{};
  final idByTitle = titleIndex(notes);
  for (final note in notes) {
    final title = firstLineTitle(note.content).trim();
    titleOf[note.id] = title.isEmpty ? '未命名笔记' : title;
  }

  final degree = <String, int>{};
  final links = <GraphLink>[];
  final seen = <String>{};
  for (final note in notes) {
    final seenOut = <String>{};
    for (final hit in wikiHits(note.content)) {
      final id = idByTitle[hit.target.toLowerCase()];
      if (id == null || id == note.id || seenOut.contains(id)) continue;
      seenOut.add(id);
      final pair = note.id.compareTo(id) < 0 ? '${note.id}\x00$id' : '$id\x00${note.id}';
      if (seen.contains(pair)) continue;
      seen.add(pair);
      links.add(GraphLink(note.id, id));
      degree[note.id] = (degree[note.id] ?? 0) + 1;
      degree[id] = (degree[id] ?? 0) + 1;
    }
  }

  final linked = degree.keys.toList()
    ..sort((a, b) {
      final d = (degree[b] ?? 0).compareTo(degree[a] ?? 0);
      return d != 0 ? d : a.compareTo(b);
    });
  final isolates = notes.map((n) => n.id).where((id) => !degree.containsKey(id)).toList()
    ..sort();

  List<String> ranked;
  if (focusId != null && notes.any((n) => n.id == focusId)) {
    final dist = <String, int>{focusId: 0};
    var frontier = [focusId];
    for (var hop = 0; hop < math.max(1, hops); hop++) {
      final next = <String>[];
      for (final id in frontier) {
        for (final link in links) {
          final other = link.source == id
              ? link.target
              : link.target == id
                  ? link.source
                  : '';
          if (other.isEmpty || dist.containsKey(other)) continue;
          dist[other] = hop + 1;
          next.add(other);
        }
      }
      frontier = next;
    }
    ranked = dist.keys.toList();
  } else {
    final mixed = <String>[];
    var linkAt = 0;
    var isolateAt = 0;
    while (linkAt < linked.length || isolateAt < isolates.length) {
      for (var step = 0; step < 4 && linkAt < linked.length; step++) {
        mixed.add(linked[linkAt++]);
      }
      if (isolateAt < isolates.length) {
        mixed.add(isolates[isolateAt++]);
      } else if (linkAt >= linked.length) {
        break;
      }
    }
    ranked = mixed;
  }

  final total = ranked.length;
  final ids = ranked.take(math.max(0, maxNodes)).toList();
  final keep = ids.toSet();
  return LinkGraph(
    nodes: ids
        .map((id) => GraphNode(
              id: id,
              title: titleOf[id] ?? '未命名笔记',
              degree: degree[id] ?? 0,
            ))
        .toList(),
    links: links.where((l) => keep.contains(l.source) && keep.contains(l.target)).toList(),
    truncated: ids.length < total,
    total: total,
  );
}

int _hashId(String id) {
  var hash = 2166136261;
  for (final c in id.codeUnits) {
    hash ^= c;
    hash = (hash * 16777619) & 0xFFFFFFFF;
  }
  return hash;
}

List<GraphPoint> layoutGraph(
  List<GraphNode> nodes,
  List<GraphLink> links,
  double width,
  double height,
) {
  final w = math.max(80.0, width);
  final h = math.max(80.0, height);
  final cx = w / 2;
  final cy = h / 2;
  final ring = math.min(w, h) * 0.32;
  final pts = <_Pt>[];
  for (var i = 0; i < nodes.length; i++) {
    final angle = (i / math.max(1, nodes.length)) * math.pi * 2 + (_hashId(nodes[i].id) % 628) / 1000;
    pts.add(_Pt(nodes[i].id, cx + math.cos(angle) * ring, cy + math.sin(angle) * ring));
  }
  final indexOf = {for (var i = 0; i < pts.length; i++) pts[i].id: i};
  final iterations = nodes.length > 80 ? 60 : 90;
  for (var iter = 0; iter < iterations; iter++) {
    final cool = 1 - iter / iterations;
    for (var i = 0; i < pts.length; i++) {
      for (var j = i + 1; j < pts.length; j++) {
        var dx = pts[i].x - pts[j].x;
        var dy = pts[i].y - pts[j].y;
        final dist = math.sqrt((dx)*(dx)+(dy)*(dy)).clamp(0.01, double.infinity);
        final force = ((170 * 170) / dist) * 0.018 * cool;
        dx /= dist;
        dy /= dist;
        pts[i].vx += dx * force;
        pts[i].vy += dy * force;
        pts[j].vx -= dx * force;
        pts[j].vy -= dy * force;
      }
    }
    for (final link in links) {
      final a = indexOf[link.source];
      final b = indexOf[link.target];
      if (a == null || b == null) continue;
      var dx = pts[b].x - pts[a].x;
      var dy = pts[b].y - pts[a].y;
      final dist = math.sqrt((dx)*(dx)+(dy)*(dy)).clamp(0.01, double.infinity);
      final force = (dist - 130) * 0.025 * cool;
      dx /= dist;
      dy /= dist;
      pts[a].vx += dx * force;
      pts[a].vy += dy * force;
      pts[b].vx -= dx * force;
      pts[b].vy -= dy * force;
    }
    const pad = 48.0;
    for (final point in pts) {
      point.vx += (cx - point.x) * 0.012 * cool;
      point.vy += (cy - point.y) * 0.012 * cool;
      point.vx *= 0.62;
      point.vy *= 0.62;
      point.x = (point.x + point.vx).clamp(pad, w - pad);
      point.y = (point.y + point.vy).clamp(pad, h - pad);
    }
  }
  return pts.map((p) => GraphPoint(p.id, p.x, p.y)).toList();
}

class _Pt {
  _Pt(this.id, this.x, this.y);
  final String id;
  double x;
  double y;
  double vx = 0;
  double vy = 0;
}
