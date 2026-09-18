import type { ClipboardEvent, DragEvent } from "react";
import { toast } from "sonner";
import {
  indentLines,
  looksLikeUrl,
  normalizeHref,
  wrapAsMarkup,
} from "@/lib/notes/insert-markup";
import { insertImageAtCursor } from "@/lib/notes/image-insert";
import { isLargeNote } from "@/lib/notes/format";
import { classifyIncoming } from "@/lib/notes/open-incoming";
import { cn } from "@/lib/utils";

type EditorPaneProps = {
  noteId: string;
  epoch?: number;
  content: string;
  centered?: boolean;
  onChange: (value: string) => void;
  onImportFiles?: (files: File[]) => void;
  onScroll?: () => void;
  onEditingChange?: (editing: boolean) => void;
};

export function EditorPane({
  noteId,
  epoch = 0,
  content,
  centered = true,
  onChange,
  onImportFiles,
  onScroll,
  onEditingChange,
}: EditorPaneProps) {
  const large = isLargeNote(content);

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
    const images = files.filter((file) => {
      const kind = classifyIncoming(file.name, file.type);
      return kind === "image" || file.type.startsWith("image/");
    });
    const docs = files.filter((file) => {
      const kind = classifyIncoming(file.name, file.type);
      return kind === "markdown" || kind === "txt" || kind === "ebook";
    });
    if (images.length === 0 && docs.length === 0) return;
    event.preventDefault();
    if (images.length) void insertFiles(event.currentTarget, images);
    if (docs.length) onImportFiles?.(docs);
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      {large ? (
        <p className="note-clip-banner" role="status">
          文件较大，已用源码打开。预览只显示开头，避免卡住。
        </p>
      ) : null}
      <textarea
        key={`${noteId}-${epoch}`}
        id="note-editor"
        defaultValue={content}
        onChange={(event) => onChange(event.target.value)}
        onFocus={() => onEditingChange?.(true)}
        onBlur={() => onEditingChange?.(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab" || event.nativeEvent.isComposing) return;
          event.preventDefault();
          const el = event.currentTarget;
          const next = indentLines(
            el.value,
            el.selectionStart,
            el.selectionEnd,
            event.shiftKey ? -1 : 1,
          );
          el.value = next.value;
          onChange(next.value);
          requestAnimationFrame(() =>
            el.setSelectionRange(next.start, next.end),
          );
        }}
        onPaste={handlePaste}
        onDragOver={(event) => {
          if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
        }}
        onDrop={handleDrop}
        onScroll={onScroll}
        placeholder="从第一行开始写，它会成为标题…"
        spellCheck
        lang="zh-CN"
        autoCapitalize="sentences"
        autoCorrect="on"
        enterKeyHint="enter"
        aria-label="笔记正文"
        className={cn(
          "min-h-0 w-full flex-1 resize-none bg-transparent px-5 py-6 font-serif text-editor text-fg",
          "placeholder:text-subtle",
          "outline-none sm:px-8 sm:py-10",
          centered && "mx-auto block max-w-prose",
        )}
      />
    </div>
  );
}
