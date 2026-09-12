import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { EXPORT_OPTIONS, type ExportFormat } from "@/lib/notes/export";
import { cn } from "@/lib/utils";

type ExportMenuProps = {
  open: boolean;
  busy?: boolean;
  canRead?: boolean;
  hasBook?: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: ExportFormat) => void;
  onImport: () => void;
  onRead: () => void;
  onExportBook: () => void;
  onMakeBook: () => void;
  onAddChapter: () => void;
};

export function ExportMenu({
  open,
  busy = false,
  canRead = false,
  hasBook = false,
  onOpenChange,
  onExport,
  onImport,
  onRead,
  onExportBook,
  onMakeBook,
  onAddChapter,
}: ExportMenuProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!panelRef.current?.contains(event.target as Node)) onOpenChange(false);
    }
    window.addEventListener("mousedown", onPointer);
    return () => window.removeEventListener("mousedown", onPointer);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="menu"
      aria-label="导出"
      className="export-menu absolute top-full right-0 z-30 mt-1 w-64 rounded-xl bg-paper p-3 text-fg shadow-raised"
    >
      <div className="px-1 pb-2 font-serif text-base font-medium">导出</div>
      <div className="mb-2 inline-flex rounded-md bg-overlay px-3 py-1 text-xs text-muted">
        通用
      </div>
      <p className="mb-1 px-1 text-xs leading-relaxed text-subtle">
        导出时会打开系统对话框，选择保存的文件夹。
      </p>
      <div className="export-formats">
        {EXPORT_OPTIONS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            disabled={busy}
            onClick={() => onExport(item.id)}
            className={cn(
              "btn-press flex w-full items-center rounded-md px-3 py-2 text-left text-sm",
              "hover:bg-overlay focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              "disabled:opacity-40",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="my-2 h-px bg-border" />
      <div className="px-1 py-1 text-xs text-subtle">电子书</div>
      <button
        type="button"
        role="menuitem"
        className="btn-press flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-overlay"
        onClick={onImport}
      >
        导入 EPUB
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!canRead}
        className="btn-press flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-overlay disabled:opacity-40"
        onClick={onRead}
      >
        阅读
      </button>
      {hasBook ? (
        <>
          <button
            type="button"
            role="menuitem"
            className="btn-press flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-overlay"
            onClick={onAddChapter}
          >
            新建章节
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={busy}
            className="btn-press flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-overlay disabled:opacity-40"
            onClick={onExportBook}
          >
            导出本书
          </button>
        </>
      ) : (
        <button
          type="button"
          role="menuitem"
          disabled={!canRead}
          className="btn-press flex w-full items-center rounded-md px-3 py-2 text-left text-sm hover:bg-overlay disabled:opacity-40"
          onClick={onMakeBook}
        >
          做成电子书
        </button>
      )}
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </div>
    </div>
  );
}
