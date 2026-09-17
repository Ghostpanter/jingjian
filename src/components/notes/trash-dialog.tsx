import { Button } from "@/components/ui/button";
import { firstLineTitle } from "@/lib/notes/format";
import type { TrashedNote } from "@/lib/notes/trash";

type TrashDialogProps = {
  open: boolean;
  items: TrashedNote[];
  onOpenChange: (open: boolean) => void;
  onRestore: (id: string) => void;
  onDrop: (id: string) => void;
  onEmpty: () => void;
};

export function TrashDialog({
  open,
  items,
  onOpenChange,
  onRestore,
  onDrop,
  onEmpty,
}: TrashDialogProps) {
  if (!open) return null;
  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trash-title"
        className="dialog-content w-full max-w-md rounded-xl bg-bg p-5 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="trash-title" className="font-serif text-lg font-medium">
          回收站
        </h2>
        <ul className="mt-3 max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <li className="py-6 text-center text-sm text-muted">回收站是空的</li>
          ) : (
            items.map((note) => (
              <li
                key={note.id}
                className="flex items-center justify-between gap-2 border-b border-border py-2 last:border-0"
              >
                <span className="min-w-0 truncate font-serif text-sm">
                  {firstLineTitle(note.content)}
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button variant="subtle" size="sm" onClick={() => onRestore(note.id)}>
                    恢复
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onDrop(note.id)}>
                    清除
                  </Button>
                </span>
              </li>
            ))
          )}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          {items.length > 0 ? (
            <Button variant="ghost" onClick={onEmpty}>
              清空
            </Button>
          ) : null}
          <Button variant="subtle" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
