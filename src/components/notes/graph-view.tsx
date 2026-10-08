import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GRAPH_PAGE, layoutGraph, linkGraph, type GraphPoint } from "@/lib/notes/link-graph";

type GraphViewProps = {
  notes: { id: string; content: string }[];
  activeId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
};

type Camera = { x: number; y: number; k: number };

function shortTitle(title: string): string {
  const text = title.trim() || "未命名笔记";
  return text.length > 12 ? `${text.slice(0, 12)}…` : text;
}

export function GraphView({ notes, activeId, onOpen, onClose }: GraphViewProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<Camera>({ x: 0, y: 0, k: 1 });
  const [page, setPage] = useState(GRAPH_PAGE);
  const [near, setNear] = useState(false);
  const [hops, setHops] = useState(1);
  const [laidOut, setLaidOut] = useState<GraphPoint[]>([]);
  const [layingOut, setLayingOut] = useState(false);
  const pointers = useRef(
    new Map<number, { x: number; y: number; ox: number; oy: number; nodeId: string | null }>(),
  );
  const pinch = useRef<{ dist: number; k: number } | null>(null);
  const moved = useRef(false);

  const graph = useMemo(
    () => linkGraph(notes, page, near ? activeId : null, hops),
    [notes, page, near, activeId, hops],
  );
  const syncLayout = graph.nodes.length > 0 && graph.nodes.length <= 48;
  const points = useMemo(() => {
    if (!syncLayout || size.width < 40) return [] as GraphPoint[];
    return layoutGraph(graph.nodes, graph.links, size.width, size.height);
  }, [graph, size.width, size.height, syncLayout]);
  const shown = syncLayout ? points : laidOut;
  const at = useMemo(() => new Map(shown.map((point) => [point.id, point])), [shown]);

  useEffect(() => {
    if (syncLayout || size.width < 40 || graph.nodes.length === 0) {
      setLaidOut([]);
      setLayingOut(false);
      return;
    }
    const requestId = Date.now();
    let worker: Worker | null = null;
    let cancelled = false;
    setLayingOut(true);
    const finish = (next: GraphPoint[]) => {
      if (cancelled) return;
      setLaidOut(next);
      setLayingOut(false);
    };
    try {
      worker = new Worker(new URL("../../lib/notes/graph-layout.worker.ts", import.meta.url), {
        type: "module",
      });
      worker.onmessage = (event: MessageEvent<{ requestId: number; points: GraphPoint[] }>) => {
        if (event.data.requestId !== requestId) return;
        finish(event.data.points);
        worker?.terminate();
      };
      worker.onerror = () => {
        finish(layoutGraph(graph.nodes, graph.links, size.width, size.height));
        worker?.terminate();
      };
      worker.postMessage({
        requestId,
        nodes: graph.nodes.map((node) => ({ id: node.id })),
        links: graph.links,
        width: size.width,
        height: size.height,
      });
    } catch {
      finish(layoutGraph(graph.nodes, graph.links, size.width, size.height));
    }
    return () => {
      cancelled = true;
      worker?.terminate();
    };
  }, [graph, size.width, size.height, syncLayout]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const rect = frame.getBoundingClientRect();
      setSize({ width: Math.round(rect.width), height: Math.round(rect.height) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const factor = event.deltaY > 0 ? 0.92 : 1.08;
      setCamera((current) => ({
        ...current,
        k: Math.min(2.8, Math.max(0.45, current.k * factor)),
      }));
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      observer.disconnect();
      frame.removeEventListener("wheel", onWheel);
    };
  }, []);

  useEffect(() => {
    setCamera({ x: 0, y: 0, k: 1 });
  }, [graph, size.width, size.height]);

  function nodeAt(clientX: number, clientY: number): string | null {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    const x = (clientX - rect.left - camera.x) / camera.k;
    const y = (clientY - rect.top - camera.y) / camera.k;
    let found: string | null = null;
    let best = 28 / camera.k;
    for (const node of graph.nodes) {
      const point = at.get(node.id);
      if (!point) continue;
      const dist = Math.hypot(point.x - x, point.y - y);
      const hit = 18 + Math.min(10, node.degree * 2);
      if (dist < hit && dist < best) {
        best = dist;
        found = node.id;
      }
    }
    return found;
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      ox: event.clientX,
      oy: event.clientY,
      nodeId: nodeAt(event.clientX, event.clientY),
    });
    moved.current = false;
    pinch.current = null;
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointers.current.get(event.pointerId);
    if (!start) return;
    const next = { ...start, x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, next);
    const active = [...pointers.current.values()];
    if (active.length >= 2) {
      const dist = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y) || 1;
      if (!pinch.current) pinch.current = { dist, k: camera.k };
      const scale = Math.min(2.8, Math.max(0.45, pinch.current.k * (dist / pinch.current.dist)));
      setCamera((current) => ({ ...current, k: scale }));
      return;
    }
    const traveled = Math.hypot(event.clientX - start.ox, event.clientY - start.oy);
    if (!moved.current) {
      if (traveled <= 6) return;
      moved.current = true;
      setCamera((current) => ({
        ...current,
        x: current.x + (event.clientX - start.ox),
        y: current.y + (event.clientY - start.oy),
      }));
      return;
    }
    setCamera((current) => ({
      ...current,
      x: current.x + (event.clientX - start.x),
      y: current.y + (event.clientY - start.y),
    }));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    const start = pointers.current.get(event.pointerId);
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (!start || moved.current || pointers.current.size > 0) return;
    if (start.nodeId) onOpen(start.nodeId);
  }

  return (
    <div
      className="graph-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="关系图"
    >
      <header className="graph-toolbar">
        <div className="min-w-0">
          <div className="font-serif text-base font-medium">关系图</div>
          <div className="text-[11px] text-muted">
            {graph.nodes.length === 0
              ? "还没有连起来的笔记"
              : layingOut
                ? "正在排版…"
                : graph.truncated
                  ? `${graph.nodes.length} / ${graph.total} 篇 · ${graph.links.length} 条双链`
                  : `${graph.nodes.length} 篇 · ${graph.links.length} 条双链`}
          </div>
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="关闭关系图" onClick={onClose}>
          <X />
        </Button>
      </header>
      <div
        ref={frameRef}
        className="graph-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {graph.nodes.length === 0 ? (
          <p className="graph-empty">
            在笔记里写 [[笔记名]]，这里会把互相提到的篇目连成一张图。点一个圆可以打开那篇。
          </p>
        ) : (
          <svg className="h-full w-full" role="img" aria-label="笔记关系图">
            <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
              {graph.links.map((link) => {
                const from = at.get(link.source);
                const to = at.get(link.target);
                if (!from || !to) return null;
                return (
                  <line
                    key={`${link.source}-${link.target}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className="graph-edge"
                  />
                );
              })}
              {graph.nodes.map((node) => {
                const point = at.get(node.id);
                if (!point) return null;
                const active = node.id === activeId;
                const radius = (active ? 9 : 6) + Math.min(6, node.degree);
                return (
                  <g key={node.id} transform={`translate(${point.x} ${point.y})`}>
                    <circle r={radius} className={active ? "graph-node is-active" : "graph-node"} />
                    <text className="graph-label" y={radius + 14} textAnchor="middle">
                      {shortTitle(node.title)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
      <p className="graph-hint flex flex-wrap items-center justify-center gap-2">
        <span>拖动空白处移动，双指缩放。点一篇打开。</span>
        <button
          type="button"
          className="btn-press rounded-md bg-overlay px-2 py-1 text-fg"
          aria-pressed={near}
          onClick={() => {
            setNear((current) => !current);
            setPage(GRAPH_PAGE);
            setHops(1);
          }}
        >
          附近
        </button>
        {near ? (
          <button
            type="button"
            className="btn-press rounded-md bg-overlay px-2 py-1 text-fg"
            onClick={() => {
              setHops((current) => current + 1);
              setPage(GRAPH_PAGE);
            }}
          >
            再扩一圈
          </button>
        ) : null}
        {graph.truncated ? (
          <button
            type="button"
            className="btn-press rounded-md bg-overlay px-2 py-1 text-fg"
            onClick={() => setPage((current) => (current >= graph.total ? current : current + GRAPH_PAGE))}
          >
            继续展开
          </button>
        ) : null}
      </p>
    </div>
  );
}
