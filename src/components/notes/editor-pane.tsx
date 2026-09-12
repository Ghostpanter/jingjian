import type { ClipboardEvent, DragEvent } from "react";
import { toast } from "sonner";
import {
  looksLikeUrl,
  normalizeHref,
  wrapAsMarkup,
} from "@/lib/notes/insert-markup";
import { insertImageAtCursor } from "@/lib/notes/image-insert";
import { cn } from "@/lib/utils";

type EditorPaneProps = {
  noteId: string;
  epoch?: number;
  content: string;
  centered?: boolean;
  onChange: (value: string) => void;
};

export function EditorPane({
  noteId,
  epoch = 0,
  content,
  centered = true,
  onChange,
}: EditorPaneProps) {
  async function insertFiles(
    el: HTMLTextAreaElement,
    files: File[],
  ) {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length === 0) return;
    let value = el.value;
    let cursor = el.selectionStart;
    try {
      for (const file of images) {
        const next = await insertImageAtCursor(
          value,
          cursor,
          cursor,
          file,
          file.name,
        );
        value = next.value;
        cursor = next.cursor;
      }
      el.value = value;
      onChange(value);
      requestAnimationFrame(() => el.setSelectionRange(cursor, cursor));
      toast.message(images.length > 1 ? `已插入 ${images.length} 张图片` : "已插入图片");
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "图片插入失败");
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const el = event.currentTarget;
    const files = [...event.clipboardData.files];
    if (files.some((file) => file.type.startsWith("image/"))) {
      event.preventDefault();
      void insertFiles(el, files);
      return;
    }
    const clip = event.clipboardData.getData("text/plain").trim();
    if (!looksLikeUrl(clip)) return;
    if (el.selectionStart === el.selectionEnd) return;
    event.preventDefault();
    const href = normalizeHref(clip);
    const next = wrapAsMarkup(
      el.value,
      el.selectionStart,
      el.selectionEnd,
      el.value.slice(el.selectionStart, el.selectionEnd),
      href,
      false,
    );
    el.value = next.value;
    onChange(next.value);
    requestAnimationFrame(() => el.setSelectionRange(next.cursor, next.cursor));
  }

  function handleDrop(event: DragEvent<HTMLTextAreaElement>) {
    const files = [...event.dataTransfer.files];
    if (!files.some((file) => file.type.startsWith("image/"))) return;
    event.preventDefault();
    void insertFiles(event.currentTarget, files);
  }

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <textarea
        key={`${noteId}-${epoch}`}
        id="note-editor"
        defaultValue={content}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
        onDragOver={(event) => {
          if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
        }}
        onDrop={handleDrop}
        placeholder="从第一行开始写，它会成为标题…"
        spellCheck
        lang="zh-CN"
        autoCapitalize="sentences"
        autoCorrect="on"
        enterKeyHint="enter"
        aria-label="笔记正文"
        className={cn(
          "h-full w-full resize-none bg-transparent px-5 py-6 font-serif text-editor leading-relaxed text-fg",
          "placeholder:text-subtle",
          "outline-none sm:px-8 sm:py-10",
          centered && "mx-auto block max-w-prose",
        )}
      />
    </div>
  );
}
