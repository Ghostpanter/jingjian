import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DeleteNoteDialogProps = {
  open: boolean;
  title: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteNoteDialog({
  open,
  title,
  onOpenChange,
  onConfirm,
}: DeleteNoteDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="dialog-center dialog-content fixed z-50 w-full max-w-sm rounded-xl bg-bg p-6 text-fg shadow-raised">
          <AlertDialog.Title className="font-serif text-lg font-medium text-balance">
            删除这篇笔记？
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-normal text-muted text-pretty">
            「{title}」将从本机移除，无法恢复。
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">取消</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>
                删除
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

type FolderDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (name: string) => void;
};

export function FolderDialog({ open, onOpenChange, onConfirm }: FolderDialogProps) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
  }, [open]);

  if (!open) return null;

  function submit() {
    const next = name.trim();
    if (!next) return;
    onConfirm(next);
    onOpenChange(false);
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
        aria-labelledby="folder-title"
        className="dialog-content w-full max-w-sm rounded-xl bg-bg p-6 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="folder-title" className="font-serif text-lg font-medium">
          新建文件夹
        </h2>
        <p className="mt-1 text-sm text-muted">可用斜线表示嵌套，例如 手册/写作。</p>
        <Input
          autoFocus
          className="mt-4"
          value={name}
          placeholder="文件夹名称"
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            创建
          </Button>
        </div>
      </div>
    </div>
  );
}

type DeleteFolderDialogProps = {
  open: boolean;
  folder: string;
  noteCount: number;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
};

export function DeleteFolderDialog({
  open,
  folder,
  noteCount,
  onOpenChange,
  onConfirm,
}: DeleteFolderDialogProps) {
  const name = folder.split("/").filter(Boolean).pop() || folder;
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="dialog-overlay fixed inset-0 z-50 bg-ink/40" />
        <AlertDialog.Content className="dialog-center dialog-content fixed z-50 w-full max-w-sm rounded-xl bg-bg p-6 text-fg shadow-raised">
          <AlertDialog.Title className="font-serif text-lg font-medium text-balance">
            删除文件夹？
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-normal text-muted text-pretty">
            {noteCount > 0
              ? `「${name}」及其中 ${noteCount} 篇笔记将从本机移除，无法恢复。`
              : `空文件夹「${name}」将从本机移除。`}
          </AlertDialog.Description>
          <div className="mt-6 flex justify-end gap-2">
            <AlertDialog.Cancel asChild>
              <Button variant="ghost">取消</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant="destructive" onClick={onConfirm}>
                删除
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}

export type SheetAction = {
  id: string;
  label: string;
  destructive?: boolean;
};

type ActionSheetProps = {
  open: boolean;
  title: string;
  actions: SheetAction[];
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string) => void;
};

export function ActionSheet({
  open,
  title,
  actions,
  onOpenChange,
  onSelect,
}: ActionSheetProps) {
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
        aria-labelledby="sheet-title"
        className="dialog-content w-full max-w-sm rounded-xl bg-bg p-4 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="sheet-title" className="px-2 pb-2 font-serif text-lg font-medium">
          {title}
        </h2>
        <div className="flex flex-col">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={
                action.destructive
                  ? "btn-press min-h-11 rounded-md px-3 py-2 text-left text-sm text-danger hover:bg-overlay"
                  : "btn-press min-h-11 rounded-md px-3 py-2 text-left text-sm text-fg hover:bg-overlay"
              }
              onClick={() => {
                onOpenChange(false);
                onSelect(action.id);
              }}
            >
              {action.label}
            </button>
          ))}
          <button
            type="button"
            className="btn-press mt-1 min-h-11 rounded-md px-3 py-2 text-left text-sm text-muted hover:bg-overlay"
            onClick={() => onOpenChange(false)}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
