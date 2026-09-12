import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { Button } from "@/components/ui/button";

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

type ShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SHORTCUTS = [
  ["N", "新建笔记"],
  ["F", "搜索笔记"],
  ["E", "源码 / 分栏 / 预览"],
  ["B", "显示或收起文件列表"],
  [",", "设置"],
  ["K", "插入外链"],
  ["Shift + E", "导出"],
  ["Shift + Backspace", "删除当前笔记"],
] as const;

export function ShortcutsDialog({
  open,
  onOpenChange,
}: ShortcutsDialogProps) {
  if (!open) return null;
  const apple =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/i.test(navigator.userAgent);
  const modLabel = apple ? "⌘" : "Ctrl";
  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={() => onOpenChange(false)}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
        className="dialog-content w-full max-w-md rounded-xl bg-bg p-6 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="shortcuts-title"
          className="font-serif text-lg font-medium text-balance"
        >
          键盘操作
        </h2>
        <p className="mt-1 text-sm text-muted">
          点左侧文件即打开。输入自动写入本机，没有打开 / 保存菜单。
          同步在设置里配置。
        </p>
        <ul className="mt-5 divide-y divide-border">
          {SHORTCUTS.map(([keys, label]) => (
            <li
              key={keys}
              className="flex items-center justify-between gap-4 py-2.5 text-sm"
            >
              <span className="text-fg">{label}</span>
              <kbd className="rounded-sm bg-overlay px-2 py-1 font-sans text-xs text-muted tabular-nums">
                {modLabel} + {keys}
              </kbd>
            </li>
          ))}
          <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="text-fg">上一条 / 下一条</span>
            <kbd className="rounded-sm bg-overlay px-2 py-1 font-sans text-xs text-muted">
              J / K 或 ↑ ↓
            </kbd>
          </li>
          <li className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <span className="text-fg">快捷键一览</span>
            <kbd className="rounded-sm bg-overlay px-2 py-1 font-sans text-xs text-muted">
              ?
            </kbd>
          </li>
        </ul>
        <div className="mt-5 flex justify-end">
          <Button variant="subtle" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
