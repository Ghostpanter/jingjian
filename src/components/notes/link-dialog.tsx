import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeHref } from "@/lib/notes/insert-markup";
import { cn } from "@/lib/utils";

export type LinkDraft = {
  text: string;
  href: string;
  image: boolean;
};

type LinkDialogProps = {
  open: boolean;
  draft: LinkDraft;
  onOpenChange: (open: boolean) => void;
  onInsert: (draft: LinkDraft) => void;
};

export function LinkDialog({ open, draft, onOpenChange, onInsert }: LinkDialogProps) {
  const [text, setText] = useState(draft.text);
  const [href, setHref] = useState(draft.href);
  const [image, setImage] = useState(draft.image);

  useEffect(() => {
    if (!open) return;
    setText(draft.text);
    setHref(draft.href);
    setImage(draft.image);
  }, [open, draft]);

  if (!open) return null;

  function submit() {
    const nextHref = normalizeHref(href);
    if (!nextHref) return;
    onInsert({
      text: text.trim() || nextHref,
      href: nextHref,
      image,
    });
  }

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-title"
        className="dialog-content w-full max-w-md rounded-xl bg-bg p-5 text-fg shadow-raised sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="link-title" className="font-serif text-lg font-medium">
          插入外链
        </h2>
        <p className="mt-1 text-sm text-muted">
          写成 Markdown 链接。预览里会在新标签打开。图片用 https 地址即可。
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className={cn(
              "btn-press rounded-md px-3 py-2 text-sm",
              !image ? "bg-paper text-fg shadow-border" : "bg-overlay text-muted",
            )}
            onClick={() => setImage(false)}
          >
            网页链接
          </button>
          <button
            type="button"
            className={cn(
              "btn-press rounded-md px-3 py-2 text-sm",
              image ? "bg-paper text-fg shadow-border" : "bg-overlay text-muted",
            )}
            onClick={() => setImage(true)}
          >
            网络图片
          </button>
        </div>

        <label className="mt-4 block">
          <span className="mb-1 block text-xs text-muted">{image ? "图片说明" : "显示文字"}</span>
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={image ? "示意图" : "静笺"}
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-xs text-muted">地址</span>
          <Input
            value={href}
            onChange={(event) => setHref(event.target.value)}
            placeholder="https://"
            autoCapitalize="off"
            autoCorrect="off"
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit();
              }
            }}
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={!normalizeHref(href)}>
            插入
          </Button>
        </div>
      </div>
    </div>
  );
}
