import { useLayoutEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "@/lib/notes/markdown";
import { renderMermaidBlocks } from "@/lib/notes/mermaid-render";
import { resolveImageSrc } from "@/lib/notes/image-store";
import type { NoteFormat } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type PreviewPaneProps = {
  content: string;
  format?: NoteFormat;
  centered?: boolean;
  reader?: boolean;
};

export function PreviewPane({
  content,
  format = "md",
  centered = true,
  reader = false,
}: PreviewPaneProps) {
  const html = useMemo(
    () => (format === "txt" ? "" : renderMarkdown(content)),
    [content, format],
  );
  const empty = !content.trim();
  const articleRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root || format === "txt") return;
    void renderMermaidBlocks(root);
    void resolvePreviewImages(root);
  });

  return (
    <div className={cn("h-full min-h-0 overflow-y-auto", reader && "reader-scroll")}>
      <div
        className={cn(
          "px-5 py-6 sm:px-8 sm:py-10",
          centered && "mx-auto w-full max-w-prose",
          reader && "reader-page",
        )}
      >
        {empty ? (
          <p className="font-serif text-lg text-subtle">预览会显示在这里</p>
        ) : format === "txt" ? (
          <article className="md-body plain-note font-serif">{content}</article>
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
