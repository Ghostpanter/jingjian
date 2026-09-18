import { useLayoutEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { isBlankContent, previewWindow } from "@/lib/notes/format";
import { renderMarkdown } from "@/lib/notes/markdown";
import { renderMermaidBlocks } from "@/lib/notes/mermaid-render";
import { resolveImageSrc } from "@/lib/notes/image-store";
import { paletteFor, readThemeConfig } from "@/lib/notes/theme";
import type { NoteFormat } from "@/lib/notes/types";
import { cn } from "@/lib/utils";
import "katex/dist/katex.min.css";

type PreviewPaneProps = {
  content: string;
  format?: NoteFormat;
  centered?: boolean;
  reader?: boolean;
  previewId?: string;
  restoreRatio?: number;
  speakIndex?: number;
  onScroll?: () => void;
  onScrollRatio?: (ratio: number) => void;
  onToggleTask?: (index: number) => void;
  onOpenWiki?: (title: string) => void;
};

export function PreviewPane({
  content,
  format = "md",
  centered = true,
  reader = false,
  previewId = "note-preview",
  restoreRatio,
  speakIndex,
  onScroll,
  onScrollRatio,
  onToggleTask,
  onOpenWiki,
}: PreviewPaneProps) {
  const windowed = useMemo(() => previewWindow(content), [content]);
  const html = useMemo(
    () => (format === "txt" ? "" : renderMarkdown(windowed.text)),
    [windowed.text, format],
  );
  const empty = isBlankContent(content);
  const articleRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const restored = useRef(false);
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null);

  useLayoutEffect(() => {
    restored.current = false;
  }, [content]);

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root || format === "txt") return;
    void renderMermaidBlocks(root, { palette: paletteFor(readThemeConfig()) });
    void resolvePreviewImages(root);
    if (typeof speakIndex === "number") {
      [...root.children].forEach((node, index) => {
        node.classList.toggle("is-speaking", index === speakIndex);
      });
    }
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
            文件较大，预览只显示开头。源码模式可查看与编辑全文开头，后文仍保留。
          </p>
        ) : null}
        {empty ? (
          <p className="font-serif text-lg text-subtle">预览会显示在这里</p>
        ) : format === "txt" ? (
          <article className="md-body plain-note font-serif">{windowed.text}</article>
        ) : (
          <article
            ref={articleRef}
            className="md-body font-serif"
            dangerouslySetInnerHTML={{ __html: html }}
            onClick={onPreviewClick}
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
