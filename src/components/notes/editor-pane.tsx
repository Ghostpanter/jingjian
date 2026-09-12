import { cn } from "@/lib/utils";

type EditorPaneProps = {
  noteId: string;
  content: string;
  centered?: boolean;
  onChange: (value: string) => void;
};

export function EditorPane({
  noteId,
  content,
  centered = true,
  onChange,
}: EditorPaneProps) {
  return (
    <div className="h-full min-h-0 overflow-hidden">
      <textarea
        key={noteId}
        id="note-editor"
        defaultValue={content}
        onChange={(event) => onChange(event.target.value)}
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
