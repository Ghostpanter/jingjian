import { firstLineTitle } from "./format.ts";
import { wikiHits } from "./wiki-links.ts";

export type GraphNode = { id: string; title: string; degree: number };
export type GraphLink = { source: string; target: string };
export type LinkGraph = { nodes: GraphNode[]; links: GraphLink[] };
export type GraphPoint = { id: string; x: number; y: number };

const MAX_NODES = 160;

export function linkGraph(notes: { id: string; content: string }[]): LinkGraph {
  const titleOf = new Map<string, string>();
  const idByTitle = new Map<string, string>();
  for (const note of notes) {
    const title = firstLineTitle(note.content).trim();
    titleOf.set(note.id, title || "未命名笔记");
    const key = title.toLowerCase();
    if (key && key !== "未命名笔记" && !idByTitle.has(key)) idByTitle.set(key, note.id);
  }

  const degree = new Map<string, number>();
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    const seenOut = new Set<string>();
    for (const hit of wikiHits(note.content)) {
      const id = idByTitle.get(hit.target.toLowerCase());
      if (!id || id === note.id || seenOut.has(id)) continue;
      seenOut.add(id);
      const pair = note.id < id ? `${note.id}\0${id}` : `${id}\0${note.id}`;
      if (seen.has(pair)) continue;
      seen.add(pair);
      links.push({ source: note.id, target: id });
      degree.set(note.id, (degree.get(note.id) ?? 0) + 1);
      degree.set(id, (degree.get(id) ?? 0) + 1);
    }
  }

  let ids = [...degree.keys()];
  if (ids.length > MAX_NODES) {
    ids = ids
      .sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0) || a.localeCompare(b))
      .slice(0, MAX_NODES);
  }
  const keep = new Set(ids);
  return {
    nodes: ids.map((id) => ({
      id,
      title: titleOf.get(id) || "未命名笔记",
      degree: degree.get(id) ?? 0,
    })),
    links: links.filter((link) => keep.has(link.source) && keep.has(link.target)),
  };
}

function hashId(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic force layout. Coordinates sit inside the given box. */
export function layoutGraph(
  nodes: { id: string }[],
  links: { source: string; target: string }[],
  width: number,
  height: number,
): GraphPoint[] {
  const w = Math.max(80, width);
  const h = Math.max(80, height);
  const cx = w / 2;
  const cy = h / 2;
  const ring = Math.min(w, h) * 0.32;
  const pts = nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 + (hashId(node.id) % 628) / 1000;
    return {
      id: node.id,
      x: cx + Math.cos(angle) * ring,
      y: cy + Math.sin(angle) * ring,
      vx: 0,
      vy: 0,
    };
  });
  const indexOf = new Map(pts.map((point, index) => [point.id, index]));
  const iterations = nodes.length > 80 ? 60 : 90;
  for (let iter = 0; iter < iterations; iter += 1) {
    const cool = 1 - iter / iterations;
    for (let i = 0; i < pts.length; i += 1) {
      for (let j = i + 1; j < pts.length; j += 1) {
        let dx = pts[i].x - pts[j].x;
        let dy = pts[i].y - pts[j].y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const force = ((170 * 170) / dist) * 0.018 * cool;
        dx /= dist;
        dy /= dist;
        pts[i].vx += dx * force;
        pts[i].vy += dy * force;
        pts[j].vx -= dx * force;
        pts[j].vy -= dy * force;
      }
    }
    for (const link of links) {
      const a = indexOf.get(link.source);
      const b = indexOf.get(link.target);
      if (a == null || b == null) continue;
      let dx = pts[b].x - pts[a].x;
      let dy = pts[b].y - pts[a].y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const force = (dist - 130) * 0.025 * cool;
      dx /= dist;
      dy /= dist;
      pts[a].vx += dx * force;
      pts[a].vy += dy * force;
      pts[b].vx -= dx * force;
      pts[b].vy -= dy * force;
    }
    const pad = 48;
    for (const point of pts) {
      point.vx += (cx - point.x) * 0.012 * cool;
      point.vy += (cy - point.y) * 0.012 * cool;
      point.vx *= 0.62;
      point.vy *= 0.62;
      point.x = Math.max(pad, Math.min(w - pad, point.x + point.vx));
      point.y = Math.max(pad, Math.min(h - pad, point.y + point.vy));
    }
  }
  return pts.map((point) => ({ id: point.id, x: point.x, y: point.y }));
}
