import { Button } from "@/components/ui/button";
import { firstLineTitle } from "@/lib/notes/format";
import type { Note } from "@/lib/notes/types";

export type SyncConflict = { local: Note; remote: Note };

type ConflictDialogProps = {
  conflict: SyncConflict | null;
  remaining: number;
  onKeepLocal: () => void;
  onKeepRemote: () => void;
  onKeepBoth: () => void;
};

export function ConflictDialog({
  conflict,
  remaining,
  onKeepLocal,
  onKeepRemote,
  onKeepBoth,
}: ConflictDialogProps) {
  if (!conflict) return null;
  const title = firstLineTitle(conflict.local.content);
  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="dialog-content w-full max-w-md rounded-xl bg-bg p-5 text-fg shadow-raised"
      >
        <h2 id="conflict-title" className="font-serif text-lg font-medium">
          同步冲突
        </h2>
        <p className="mt-2 text-sm text-muted">
          「{title}」本机和远端不一样。还剩 {remaining} 篇。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted">
          <p className="rounded-md bg-overlay p-3">
            本机 {conflict.local.content.slice(0, 80) || "（空白）"}
          </p>
          <p className="rounded-md bg-overlay p-3">
            远端 {conflict.remote.content.slice(0, 80) || "（空白）"}
          </p>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onKeepBoth}>
            都保留
          </Button>
          <Button variant="subtle" onClick={onKeepRemote}>
            用远端
          </Button>
          <Button onClick={onKeepLocal}>留本机</Button>
        </div>
      </div>
    </div>
  );
}
