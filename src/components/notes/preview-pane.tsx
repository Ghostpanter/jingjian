import { useLayoutEffect, useMemo, useRef } from "react";
import { isBlankContent, previewWindow } from "@/lib/notes/format";
import { renderMarkdown } from "@/lib/notes/markdown";
import { renderMermaidBlocks } from "@/lib/notes/mermaid-render";
import { resolveImageSrc } from "@/lib/notes/image-store";
import { paletteFor, readThemeConfig } from "@/lib/notes/theme";
import type { NoteFormat } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type PreviewPaneProps = {
  content: string;
  format?: NoteFormat;
  centered?: boolean;
  reader?: boolean;
  onScroll?: () => void;
};

export function PreviewPane({
  content,
  format = "md",
  centered = true,
  reader = false,
  onScroll,
}: PreviewPaneProps) {
  const windowed = useMemo(() => previewWindow(content), [content]);
  const html = useMemo(
    () => (format === "txt" ? "" : renderMarkdown(windowed.text)),
    [windowed.text, format],
  );
  const empty = isBlankContent(content);
  const articleRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root || format === "txt") return;
    void renderMermaidBlocks(root, { palette: paletteFor(readThemeConfig()) });
    void resolvePreviewImages(root);
  });

  return (
    <div
      id="note-preview"
      className={cn("h-full min-h-0 overflow-y-auto", reader && "reader-scroll")}
      onScroll={onScroll}
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
          />
        )}
      </div>
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
