import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { isBlankContent, previewWindow } from "@/lib/notes/format";
import { ensureKatex, upgradeMath } from "@/lib/notes/markdown-extra";
import { renderMarkdown } from "@/lib/notes/markdown";
import { renderMermaidBlocks } from "@/lib/notes/mermaid-render";
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
  onScroll,
  onScrollRatio,
  onToggleTask,
  onOpenWiki,
}: PreviewPaneProps) {
  const [anchor, setAnchor] = useState(0);
  const pendingHeading = useRef<string | null>(null);
  const windowed = useMemo(() => previewWindow(content, undefined, anchor), [content, anchor]);
  const headingSeed = useMemo(
    () => (windowed.start > 0 ? headingSeedBefore(content, windowed.start) : undefined),
    [content, windowed.start],
  );
  const html = useMemo(
    () => (format === "txt" ? "" : renderMarkdown(windowed.text, notes, headingSeed)),
    [windowed.text, format, notes, headingSeed],
  );
  const empty = isBlankContent(content);
  const articleRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  useEffect(() => {
    setAnchor(0);
  }, [anchorKey]);

  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<{ start?: number; headingId?: string }>).detail;
      if (!detail || typeof detail.start !== "number") return;
      pendingHeading.current = detail.headingId || null;
      setAnchor(detail.start);
    };
    window.addEventListener("jingjian-reveal", onReveal);
    return () => window.removeEventListener("jingjian-reveal", onReveal);
  }, []);

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
  }, [html, anchor]);

  useLayoutEffect(() => {
    restored.current = false;
  }, [content]);

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root || format === "txt") return;
    let cancelled = false;
    if (root.querySelector(".math-pending")) {
      void import("katex/dist/katex.min.css");
      void ensureKatex().then(() => {
        if (!cancelled && articleRef.current) upgradeMath(articleRef.current);
      });
    }
    void renderMermaidBlocks(root, { palette: paletteFor(readThemeConfig()) });
    void resolvePreviewImages(root);
    if (typeof speakIndex === "number") {
      [...root.children].forEach((node, index) => {
        node.classList.toggle("is-speaking", index === speakIndex);
      });
    }
    return () => {
      cancelled = true;
    };
  });

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
      if (Number.isFinite(index)) onToggleTask?.(index);
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
        if (!el || !onScrollRatio) return;
        const max = el.scrollHeight - el.clientHeight;
        onScrollRatio(max > 0 ? el.scrollTop / max : 0);
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
              ? "文件较大，预览正显示这一段，不是全文。"
              : "文件较大，预览只显示开头。源码模式可查看与编辑全文开头，后文仍保留。"}
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
            dangerouslySetInnerHTML={{ __html: html }}
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

async function resolvePreviewImages(root: HTMLElement) {
  const images = [...root.querySelectorAll("img")];
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute("src") || "";
      const resolved = await resolveImageSrc(src);
      if (resolved) image.src = resolved;
    }),
  );
}
