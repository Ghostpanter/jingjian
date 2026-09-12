import type { ClipboardEvent } from "react";
import {
  looksLikeUrl,
  normalizeHref,
  wrapAsMarkup,
} from "@/lib/notes/insert-markup";
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
  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const clip = event.clipboardData.getData("text/plain").trim();
    if (!looksLikeUrl(clip)) return;
    const el = event.currentTarget;
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

  return (
    <div className="h-full min-h-0 overflow-hidden">
      <textarea
        key={`${noteId}-${epoch}`}
        id="note-editor"
        defaultValue={content}
        onChange={(event) => onChange(event.target.value)}
        onPaste={handlePaste}
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
