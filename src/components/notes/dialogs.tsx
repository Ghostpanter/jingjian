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

type ShortcutsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const SHORTCUT_GROUPS = [
  {
    title: "排版",
    items: [
      ["B", "加粗"],
      ["I", "斜体"],
      ["U", "下划线"],
      ["Shift + 5", "删除线"],
      ["1 … 6", "一至六级标题"],
      ["0", "正文段落"],
      ["Shift + Q", "引用"],
      ["Shift + ]", "无序列表"],
      ["Shift + [", "有序列表"],
      ["Shift + X", "任务列表"],
      ["Shift + K", "代码块"],
      ["Shift + `", "行内代码"],
      ["T", "插入表格"],
      ["K", "插入外链"],
      ["Shift + I", "插入图片"],
    ],
  },
  {
    title: "应用",
    items: [
      ["N", "新建笔记"],
      ["F", "搜索笔记"],
      ["E", "源码 / 分栏 / 预览"],
      ["Shift + L", "显示或收起文件列表"],
      [",", "设置"],
      ["Shift + E", "导出"],
      ["Shift + Backspace", "删除当前笔记"],
    ],
  },
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
        className="dialog-content w-full max-w-lg rounded-xl bg-bg p-6 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2
          id="shortcuts-title"
          className="font-serif text-lg font-medium text-balance"
        >
          键盘操作
        </h2>
        <p className="mt-1 text-sm text-muted">
          排版快捷键与 Typora 相同。点左侧文件即打开，输入自动写入本机。
        </p>
        <div className="shortcuts-list mt-4 pr-1">
          {SHORTCUT_GROUPS.map((group) => (
            <section key={group.title} className="mb-4 last:mb-0">
              <h3 className="pb-1 text-xs tracking-wide text-subtle">{group.title}</h3>
              <ul className="divide-y divide-border">
                {group.items.map(([keys, label]) => (
                  <li
                    key={keys}
                    className="flex items-center justify-between gap-4 py-2 text-sm"
                  >
                    <span className="text-fg">{label}</span>
                    <kbd className="rounded-sm bg-overlay px-2 py-1 font-sans text-xs text-muted tabular-nums">
                      {modLabel} + {keys}
                    </kbd>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <ul className="divide-y divide-border border-t border-border">
            <li className="flex items-center justify-between gap-4 py-2 text-sm">
              <span className="text-fg">缩进 / 取消缩进</span>
              <kbd className="rounded-sm bg-overlay px-2 py-1 font-sans text-xs text-muted">
                Tab / Shift + Tab
              </kbd>
            </li>
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
        </div>
        <div className="mt-5 flex justify-end">
          <Button variant="subtle" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </div>
      </div>
    </div>
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
