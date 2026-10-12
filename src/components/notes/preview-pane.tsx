import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { isBlankContent, EDITOR_WINDOW_CHARS, extendBounds, peekPendingReveal, PREVIEW_WINDOW_CHARS, previewWindow } from "@/lib/notes/format";
import { countTasksBefore, ensureKatex, upgradeMathNode } from "@/lib/notes/markdown-extra";
import { applyCachedMermaid, renderMermaidBlocks } from "@/lib/notes/mermaid-render";
import { createSectionCache, renderSections, type SectionEntry } from "@/lib/notes/preview-blocks";
import { resolveImageSrc } from "@/lib/notes/image-store";
import { headingSeedBefore } from "@/lib/notes/outline";
import { paletteFor, readThemeConfig } from "@/lib/notes/theme";
import type { NoteFormat } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type PreviewPaneProps = {
  content: string;
  notes?: { id: string; content: string }[];
  format?: NoteFormat;
  centered?: boolean;
  focusMode?: boolean;
  reader?: boolean;
  previewId?: string;
  restoreRatio?: number;
  speakIndex?: number;
  anchorKey?: string;
  noteId?: string;
  onScroll?: () => void;
  onScrollRatio?: (ratio: number) => void;
  onToggleTask?: (index: number) => void;
  onOpenWiki?: (title: string) => void;
};

export function PreviewPane({
  content,
  notes,
  format = "md",
  centered = true,
  focusMode = false,
  reader = false,
  previewId = "note-preview",
  restoreRatio,
  speakIndex,
  anchorKey,
  noteId,
  onScroll,
  onScrollRatio,
  onToggleTask,
  onOpenWiki,
}: PreviewPaneProps) {
  const [anchor, setAnchor] = useState(0);
  const [span, setSpan] = useState<{ start: number; end: number } | null>(null);
  const pendingHeading = useRef<string | null>(null);
  const preserveScroll = useRef(false);
  const prevStart = useRef(0);
  const growLock = useRef(0);
  const contentRef = useRef(content);
  contentRef.current = content;
  const windowed = useMemo(() => {
    if (span && content.length > PREVIEW_WINDOW_CHARS) {
      const start = Math.max(0, Math.min(span.start, content.length));
      const end = Math.max(start, Math.min(span.end, content.length));
      return {
        text: content.slice(start, end),
        truncated: start > 0 || end < content.length,
        start,
      };
    }
    return previewWindow(content, undefined, anchor);
  }, [content, anchor, span]);
  const headingSeed = useMemo(
    () => (windowed.start > 0 ? headingSeedBefore(content, windowed.start) : undefined),
    [content, windowed.start],
  );
  const empty = isBlankContent(content);
  const articleRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  useLayoutEffect(() => {
    const pending = noteId ? peekPendingReveal(noteId) : null;
    if (pending) {
      setAnchor(pending.start);
      setSpan(null);
      return;
    }
    setAnchor(0);
    setSpan(null);
  }, [anchorKey, noteId]);

  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<{ start?: number; headingId?: string; noteId?: string }>).detail;
      if (!detail || typeof detail.start !== "number") return;
      if (detail.noteId && noteId && detail.noteId !== noteId) return;
      pendingHeading.current = detail.headingId || null;
      setAnchor(detail.start);
      setSpan(null);
    };
    window.addEventListener("jingjian-reveal", onReveal);
    return () => window.removeEventListener("jingjian-reveal", onReveal);
  }, [noteId]);

  // --- Incremental preview -------------------------------------------------
  // Blocks are rendered once and their DOM nodes kept; an edit swaps in only
  // the blocks whose text (or numbering) changed. Math and Mermaid upgrade
  // lazily when they scroll near the screen.
  const sectionCache = useRef(createSectionCache());
  const mounted = useRef<{ entry: SectionEntry; nodes: Node[] }[]>([]);
  const library = useRef<{ notes: typeof notes; version: number }>({ notes, version: 0 });
  const observer = useRef<IntersectionObserver | null>(null);
  const visibleDiagrams = useRef(new Set<HTMLElement>());
  const mermaidTimer = useRef(0);
  const patchedKey = useRef("");
  const [patchTick, setPatchTick] = useState(0);
  const patchKey = `${noteId ?? ""}|${format}|${windowed.start}|${anchorKey ?? ""}`;

  function scheduleMermaid() {
    window.clearTimeout(mermaidTimer.current);
    // Same 420 ms pause as before: diagrams draw once typing stops.
    mermaidTimer.current = window.setTimeout(() => {
      const live = articleRef.current;
      const nodes = [...visibleDiagrams.current].filter(
        (node) => node.isConnected && node.getAttribute("data-processed") !== "true",
      );
      if (!live || nodes.length === 0) return;
      void renderMermaidBlocks(live, { palette: paletteFor(readThemeConfig()), only: nodes });
    }, 420);
  }

  function lazyObserver(): IntersectionObserver | null {
    if (observer.current || typeof IntersectionObserver === "undefined") return observer.current;
    observer.current = new IntersectionObserver(
      (entries) => {
        let diagrams = false;
        for (const item of entries) {
          const el = item.target as HTMLElement;
          if (el.classList.contains("math-pending")) {
            if (!item.isIntersecting) continue;
            observer.current?.unobserve(el);
            void ensureKatex().then(() => upgradeMathNode(el));
            continue;
          }
          if (item.isIntersecting) {
            visibleDiagrams.current.add(el);
            diagrams = true;
          } else {
            visibleDiagrams.current.delete(el);
          }
        }
        if (diagrams) scheduleMermaid();
      },
      { root: scrollRef.current, rootMargin: "600px 0px" },
    );
    return observer.current;
  }

  function upgradeFresh(fresh: Element[]) {
    if (fresh.length === 0) return;
    const palette = paletteFor(readThemeConfig());
    const io = lazyObserver();
    let math = false;
    let diagrams = false;
    for (const el of fresh) {
      applyCachedMermaid(el, palette);
      const pendingMath = el.matches(".math-pending") ? [el] : [...el.querySelectorAll(".math-pending")];
      for (const node of pendingMath) {
        math = true;
        if (io) io.observe(node);
        else void ensureKatex().then(() => upgradeMathNode(node));
      }
      const diagramNodes = el.matches("pre.mermaid") ? [el as HTMLElement] : [...el.querySelectorAll<HTMLElement>("pre.mermaid")];
      for (const node of diagramNodes) {
        diagrams = true;
        if (io) io.observe(node);
        else visibleDiagrams.current.add(node);
      }
      void resolvePreviewImages(el);
    }
    if (math) void import("katex/dist/katex.min.css");
    if (diagrams && !io) scheduleMermaid();
  }

  function patchPreview() {
    const root = articleRef.current;
    if (!root) return;
    // Typing in this note rebuilds `notes` every keystroke. Only bump the embed
    // cache when *other* notes change — otherwise every keystroke redraws embeds
    // (and Mermaid) for no reason.
    if (library.current.notes !== notes) {
      const prev = library.current.notes ?? [];
      const next = notes ?? [];
      const prevOthers = new Map(
        prev.filter((item) => item.id !== noteId).map((item) => [item.id, item.content]),
      );
      let libraryChanged = prevOthers.size !== next.filter((item) => item.id !== noteId).length;
      if (!libraryChanged) {
        for (const item of next) {
          if (item.id === noteId) continue;
          if (prevOthers.get(item.id) !== item.content) {
            libraryChanged = true;
            break;
          }
        }
      }
      library.current = {
        notes,
        version: libraryChanged ? library.current.version + 1 : library.current.version,
      };
    }
    const result = renderSections(windowed.text, {
      cache: sectionCache.current,
      library: notes,
      libraryVersion: library.current.version,
      headingSeed,
    });
    const pool = new Map<SectionEntry, Node[][]>();
    for (const item of mounted.current) {
      const list = pool.get(item.entry);
      if (list) list.push(item.nodes);
      else pool.set(item.entry, [item.nodes]);
    }
    const next: { entry: SectionEntry; nodes: Node[] }[] = [];
    const order: Node[] = [];
    const fresh: Element[] = [];
    const doc = root.ownerDocument;
    for (const section of result.sections) {
      let nodes = pool.get(section.entry)?.shift();
      if (!nodes) {
        const template = doc.createElement("template");
        template.innerHTML = section.entry.html;
        nodes = [...template.content.childNodes];
        for (const node of nodes) if (node instanceof Element) fresh.push(node);
      }
      next.push({ entry: section.entry, nodes });
      order.push(...nodes);
    }
    let cursor = root.firstChild;
    for (const node of order) {
      if (node === cursor) {
        cursor = cursor.nextSibling;
        continue;
      }
      root.insertBefore(node, cursor);
    }
    while (cursor) {
      const after: ChildNode | null = cursor.nextSibling;
      if (cursor instanceof Element) {
        for (const node of cursor.querySelectorAll("pre.mermaid, .math-pending")) {
          observer.current?.unobserve(node);
          visibleDiagrams.current.delete(node as HTMLElement);
        }
      }
      cursor.remove();
      cursor = after;
    }
    mounted.current = next;
    upgradeFresh(fresh);
    setPatchTick((tick) => tick + 1);
  }

  useLayoutEffect(() => {
    if (format === "txt" || empty) {
      mounted.current = [];
      patchedKey.current = "";
      return;
    }
    const root = articleRef.current;
    // Opening a note, moving the window or a fresh article: draw now.
    if (patchedKey.current !== patchKey || !root || root.childNodes.length === 0) {
      patchedKey.current = patchKey;
      patchPreview();
      return;
    }
    // Plain typing: keep it off the keystroke, render when the browser is idle.
    const idle = typeof window.requestIdleCallback === "function";
    const handle = idle
      ? window.requestIdleCallback(() => patchPreview(), { timeout: 200 })
      : window.setTimeout(() => patchPreview(), 16);
    return () => {
      if (idle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
    // patchPreview reads the latest props through this render's closure.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowed.text, headingSeed, notes, format, empty, patchKey]);

  useEffect(
    () => () => {
      observer.current?.disconnect();
      window.clearTimeout(mermaidTimer.current);
    },
    [],
  );

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root || typeof speakIndex !== "number") return;
    [...root.children].forEach((node, index) => {
      node.classList.toggle("is-speaking", index === speakIndex);
    });
  }, [speakIndex, patchTick]);

  useLayoutEffect(() => {
    const id = pendingHeading.current;
    if (!id || !scrollRef.current) return;
    const target = scrollRef.current.querySelector(`[id="${CSS.escape(id)}"]`);
    if (target instanceof HTMLElement) {
      const top =
        target.getBoundingClientRect().top -
        scrollRef.current.getBoundingClientRect().top +
        scrollRef.current.scrollTop;
      scrollRef.current.scrollTop = Math.max(0, top - 8);
    }
    pendingHeading.current = null;
  }, [patchTick, anchor]);

  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || !preserveScroll.current) {
      prevStart.current = windowed.start;
      return;
    }
    preserveScroll.current = false;
    const delta = prevStart.current - windowed.start;
    prevStart.current = windowed.start;
    if (delta !== 0) {
      const ratio = el.scrollHeight / Math.max(1, windowed.text.length);
      el.scrollTop = Math.max(0, el.scrollTop + delta * ratio);
    }
  }, [windowed.start, windowed.text]);

  useLayoutEffect(() => {
    restored.current = false;
  }, [content]);

  useLayoutEffect(() => {
    if (!reader || typeof speakIndex !== "number" || speakIndex < 0) return;
    const node = articleRef.current?.children[speakIndex] as HTMLElement | undefined;
    if (!node) return;
    node.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [reader, speakIndex]);

  useLayoutEffect(() => {
    if (!reader || restoreRatio == null) return;
    const el = scrollRef.current;
    if (!el) return;
    let cancelled = false;
    const apply = () => {
      if (cancelled || restored.current) return;
      const max = el.scrollHeight - el.clientHeight;
      if (max > 1) {
        el.scrollTop = restoreRatio * max;
        restored.current = true;
      }
    };
    apply();
    const timer = window.setTimeout(apply, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [content, reader, restoreRatio]);

  function onPreviewClick(event: MouseEvent<HTMLElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    const task = target.closest("input.task-toggle") as HTMLInputElement | null;
    if (task) {
      event.preventDefault();
      const index = Number(task.dataset.task);
      // Checkbox numbers restart at the top of the rendered window; the note
      // itself counts from its first line.
      const before = windowed.start > 0 ? countTasksBefore(contentRef.current, windowed.start) : 0;
      if (Number.isFinite(index)) onToggleTask?.(index + before);
      return;
    }
    const wiki = target.closest("a.wiki-link") as HTMLAnchorElement | null;
    if (wiki) {
      event.preventDefault();
      const title = wiki.dataset.wiki?.trim();
      if (title) onOpenWiki?.(title);
      return;
    }
    const copy = target.closest("button.code-copy") as HTMLButtonElement | null;
    if (copy) {
      event.preventDefault();
      const block = copy.closest(".code-block");
      const text = block?.querySelector("code")?.textContent ?? "";
      void navigator.clipboard.writeText(text).then(
        () => {
          copy.textContent = "已复制";
          window.setTimeout(() => {
            copy.textContent = "复制";
          }, 1200);
        },
        () => {
          copy.textContent = "失败";
        },
      );
      return;
    }
    const image = target.closest("img") as HTMLImageElement | null;
    if (image && !image.closest(".mermaid-block")) {
      event.preventDefault();
      setLightbox({ src: image.currentSrc || image.src, alt: image.alt || "" });
    }
  }

  function onFocusBlock(event: MouseEvent<HTMLElement>) {
    if (!focusMode || reader) return;
    const target = event.target as HTMLElement;
    if (target.closest("a, button, input, img")) return;
    const block = (event.target as HTMLElement).closest(".md-body > *");
    if (!(block instanceof HTMLElement) || !articleRef.current?.contains(block)) return;
    for (const child of articleRef.current.children) child.classList.remove("is-focus-block");
    block.classList.add("is-focus-block");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const scroller = scrollRef.current;
    if (!scroller) return;
    const top = block.offsetTop - scroller.clientHeight * 0.38;
    scroller.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }

  return (
    <div
      ref={scrollRef}
      id={previewId}
      className={cn("h-full min-h-0 overflow-y-auto", reader && "reader-scroll")}
      onScroll={() => {
        onScroll?.();
        const el = scrollRef.current;
        if (!el) return;
        if (onScrollRatio) {
          const max = el.scrollHeight - el.clientHeight;
          onScrollRatio(max > 0 ? el.scrollTop / max : 0);
        }
        if (contentRef.current.length <= PREVIEW_WINDOW_CHARS || growLock.current) return;
        const baseEnd = windowed.start + windowed.text.length;
        const nearTop = el.scrollTop <= 64 && windowed.start > 0;
        const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 80 && baseEnd < contentRef.current.length;
        const dir = nearTop ? -1 : nearBottom ? 1 : 0;
        if (!dir) return;
        growLock.current = requestAnimationFrame(() => {
          growLock.current = 0;
          const content = contentRef.current;
          const next = extendBounds(
            content.length,
            { start: windowed.start, end: baseEnd },
            dir,
            16_000,
            EDITOR_WINDOW_CHARS,
          );
          if (!next) return;
          // Snap to line boundaries so heading seeds / task windows stay coherent.
          let start = next.start;
          let end = next.end;
          if (start > 0) {
            const nl = content.lastIndexOf("\n", start - 1);
            start = nl >= 0 ? nl + 1 : 0;
          }
          if (end < content.length) {
            const nl = content.indexOf("\n", end);
            if (nl >= 0) end = nl + 1;
          }
          if (start >= end) return;
          preserveScroll.current = true;
          setSpan({ start, end });
        });
      }}
    >
      <div
        className={cn(
          "px-5 py-6 sm:px-8 sm:py-10",
          centered && "mx-auto w-full max-w-prose",
          reader && "reader-page",
        )}
      >
        {windowed.truncated ? (
          <p className="note-clip-banner" role="status">
            {windowed.start > 0
              ? "文件较大，滚到边缘会继续展开这一段。"
              : "文件较大，预览先显示开头。滚到底会继续展开后面的文字。"}
          </p>
        ) : null}
        {empty ? (
          <p className="font-serif text-lg text-subtle">预览会显示在这里</p>
        ) : format === "txt" ? (
          <article className={cn("md-body plain-note font-serif", focusMode && !reader && "is-focus")}>
            {windowed.text}
          </article>
        ) : (
          <article
            ref={articleRef}
            className={cn("md-body font-serif", focusMode && !reader && "is-focus")}
            onClick={(event) => {
              onPreviewClick(event);
              onFocusBlock(event);
            }}
          />
        )}
      </div>
      {lightbox ? (
        <button
          type="button"
          className="image-lightbox"
          aria-label="关闭图片"
          onClick={() => setLightbox(null)}
        >
          <img src={lightbox.src} alt={lightbox.alt} />
        </button>
      ) : null}
    </div>
  );
}

async function resolvePreviewImages(root: Element) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute("src") || "";
      const resolved = await resolveImageSrc(src);
      if (resolved) image.src = resolved;
    }),
  );
}
