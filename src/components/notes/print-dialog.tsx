import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  PRINT_SYSTEM_INTRO,
  buildPrintDocument,
  printJobTitle,
  selectPrintNotes,
  windowPrintNotes,
  type PrintNote,
  type PrintScope,
} from "@/lib/notes/print-doc";
import { preparePrintDocument, printPreparedFrame } from "@/lib/notes/print-job";
import { cn } from "@/lib/utils";

type PrintDialogProps = {
  open: boolean;
  notes: PrintNote[];
  activeId: string;
  onOpenChange: (open: boolean) => void;
  onError: (message: string) => void;
  onSent: () => void;
};

export function PrintDialog({
  open,
  notes,
  activeId,
  onOpenChange,
  onError,
  onSent,
}: PrintDialogProps) {
  const active = notes.find((note) => note.id === activeId);
  const isBook = Boolean(active?.bookId);
  const [scope, setScope] = useState<PrintScope>("chapter");
  const [busy, setBusy] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const baking = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (open) setScope("chapter");
  }, [open, activeId]);

  const prepared = useMemo(() => {
    if (!open || !active) return null;
    const selected = selectPrintNotes(notes, active.id, isBook ? scope : "chapter");
    const windowed = windowPrintNotes(selected);
    const title = printJobTitle(selected);
    return {
      title,
      html: buildPrintDocument({
        title,
        sections: windowed.sections,
        omittedChapters: windowed.omittedChapters,
      }),
      truncated: windowed.truncated,
      omittedChapters: windowed.omittedChapters,
    };
  }, [open, notes, active, isBook, scope]);

  if (!open || !prepared) return null;
  const sheet = prepared;

  function onPreviewLoad() {
    const doc = frameRef.current?.contentDocument;
    if (!doc) return;
    baking.current = preparePrintDocument(doc).catch(() => undefined);
  }

  async function handlePrint() {
    const frame = frameRef.current;
    if (!frame) return;
    setBusy(true);
    try {
      if (baking.current) await baking.current;
      const result = await printPreparedFrame(frame, sheet.title);
      if (result === "sent") onSent();
    } catch (error) {
      onError(error instanceof Error ? error.message : "无法打印");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-3 sm:items-center sm:p-6"
      onClick={() => {
        if (!busy) onOpenChange(false);
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="print-title"
        className="print-dialog dialog-content w-full max-w-3xl rounded-xl bg-bg p-4 text-fg shadow-raised sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="print-title" className="font-serif text-lg font-medium text-balance">
          打印
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{PRINT_SYSTEM_INTRO}</p>
        {isBook ? (
          <div
            className="mt-3 inline-flex rounded-md bg-overlay p-0.5"
            role="radiogroup"
            aria-label="打印范围"
          >
            {(
              [
                ["chapter", "本章"],
                ["book", "全书"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={scope === id}
                className={cn(
                  "btn-press rounded-sm px-3 py-1.5 text-sm",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  scope === id ? "bg-paper text-fg shadow-border" : "text-muted",
                )}
                onClick={() => setScope(id)}
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}
            {sheet.truncated ? (
          <p className="mt-3 text-sm leading-relaxed text-muted" role="status">
            {sheet.omittedChapters > 0
              ? `这次只排了前面的章节，还有 ${sheet.omittedChapters} 章请分开打印。`
              : "文件较大，纸面只排开头。全文仍在笔记里。"}
          </p>
        ) : null}
        <div className="print-stage mt-3">
          <iframe
            ref={frameRef}
            title="纸面预览"
            srcDoc={sheet.html}
            onLoad={onPreviewLoad}
          />
        </div>
        <div className="mt-4 flex shrink-0 justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            关闭
          </Button>
          <Button disabled={busy} onClick={() => void handlePrint()}>
            {busy ? "正在准备" : "打印"}
          </Button>
        </div>
      </div>
    </div>
  );
}
