import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type CreateMenuProps = {
  open: boolean;
  anchor: HTMLElement | null;
  hasBook?: boolean;
  canMakeBook?: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateMarkdown: () => void;
  onCreateText: () => void;
  onImportMarkdown: () => void;
  onImportTxt: () => void;
  onImportEpub: () => void;
  onMakeBook: () => void;
  onAddChapter: () => void;
};

const itemClass = cn(
  "btn-press flex min-h-11 w-full items-center rounded-md px-3 py-2 text-left text-sm",
  "hover:bg-overlay focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
);

export function CreateMenu({
  open,
  anchor,
  hasBook = false,
  canMakeBook = false,
  onOpenChange,
  onCreateMarkdown,
  onCreateText,
  onImportMarkdown,
  onImportTxt,
  onImportEpub,
  onMakeBook,
  onAddChapter,
}: CreateMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, right: 0 });

  useLayoutEffect(() => {
    if (!open || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({
      top: Math.round(rect.bottom + 4),
      right: Math.round(window.innerWidth - rect.right),
    });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (panelRef.current?.contains(target) || anchor?.contains(target)) return;
      onOpenChange(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onOpenChange(false);
    }
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange, anchor]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="新建或导入"
      className="fixed z-50 w-60 max-h-[min(32rem,calc(100dvh-5rem))] overflow-y-auto rounded-xl bg-paper p-3 text-fg shadow-raised"
      style={{ top: pos.top, right: pos.right }}
    >
      <div className="px-1 pb-2 font-serif text-base font-medium">新建</div>
      <button type="button" role="menuitem" className={itemClass} onClick={onCreateMarkdown}>
        Markdown
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={onCreateText}>
        纯文本 TXT
      </button>
      <div className="my-2 h-px bg-border" />
      <div className="px-1 py-1 text-xs text-subtle">导入</div>
      <button type="button" role="menuitem" className={itemClass} onClick={onImportMarkdown}>
        Markdown
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={onImportTxt}>
        TXT
      </button>
      <button type="button" role="menuitem" className={itemClass} onClick={onImportEpub}>
        EPUB 电子书
      </button>
      {canMakeBook || hasBook ? (
        <>
          <div className="my-2 h-px bg-border" />
          <div className="px-1 py-1 text-xs text-subtle">电子书</div>
          {canMakeBook ? (
            <button type="button" role="menuitem" className={itemClass} onClick={onMakeBook}>
              做成电子书
            </button>
          ) : null}
          {hasBook ? (
            <button type="button" role="menuitem" className={itemClass} onClick={onAddChapter}>
              新建章节
            </button>
          ) : null}
        </>
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </div>
    </div>
  );
}
