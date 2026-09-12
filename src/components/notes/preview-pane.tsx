import { useLayoutEffect, useMemo, useRef } from "react";
import { renderMarkdown } from "@/lib/notes/markdown";
import { renderMermaidBlocks } from "@/lib/notes/mermaid-render";
import { cn } from "@/lib/utils";

type PreviewPaneProps = {
  content: string;
  centered?: boolean;
};

export function PreviewPane({ content, centered = true }: PreviewPaneProps) {
  const html = useMemo(() => renderMarkdown(content), [content]);
  const empty = !content.trim();
  const articleRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const root = articleRef.current;
    if (!root) return;
    void renderMermaidBlocks(root);
  });

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div
        className={cn(
          "px-5 py-6 sm:px-8 sm:py-10",
          centered && "mx-auto w-full max-w-prose",
        )}
      >
        {empty ? (
          <p className="font-serif text-lg text-subtle">预览会显示在这里</p>
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
