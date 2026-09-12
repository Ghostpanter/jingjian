import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { EXPORT_OPTIONS, type ExportFormat } from "@/lib/notes/export";
import { cn } from "@/lib/utils";

type ExportMenuProps = {
  open: boolean;
  busy?: boolean;
  hasBook?: boolean;
  onOpenChange: (open: boolean) => void;
  onExport: (format: ExportFormat) => void;
  onExportBook: () => void;
};

export function ExportMenu({
  open,
  busy = false,
  hasBook = false,
  onOpenChange,
  onExport,
  onExportBook,
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
        先选择保存位置，再生成文件。
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
      {hasBook ? (
        <>
          <div className="my-2 h-px bg-border" />
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
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
          关闭
        </Button>
      </div>
    </div>
  );
}
