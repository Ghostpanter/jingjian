import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { applyHunks, textHunks } from "@/lib/notes/conflict-diff";
import { firstLineTitle } from "@/lib/notes/format";
import type { Note } from "@/lib/notes/types";

export type SyncConflict = { local: Note; remote: Note };

type ConflictDialogProps = {
  conflict: SyncConflict | null;
  remaining: number;
  onKeepLocal: () => void;
  onKeepRemote: () => void;
  onKeepBoth: () => void;
  onMerge: (content: string) => void;
};

function clip(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "（空白）";
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat;
}

export function ConflictDialog({
  conflict,
  remaining,
  onKeepLocal,
  onKeepRemote,
  onKeepBoth,
  onMerge,
}: ConflictDialogProps) {
  const hunks = useMemo(
    () => (conflict ? textHunks(conflict.local.content, conflict.remote.content) : []),
    [conflict],
  );
  const diffs = useMemo(() => hunks.filter((hunk) => hunk.kind !== "same").slice(0, 30), [hunks]);
  const [choices, setChoices] = useState<boolean[]>([]);
  const choiceKey = conflict ? `${conflict.local.id}:${conflict.local.updatedAt}:${conflict.remote.updatedAt}` : "";
  const [seen, setSeen] = useState("");
  if (choiceKey !== seen) {
    setSeen(choiceKey);
    setChoices(diffs.map(() => true));
  }

  if (!conflict) return null;
  const title = firstLineTitle(conflict.local.content);
  return (
    <div className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-title"
        className="dialog-content max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl bg-bg p-5 text-fg shadow-raised"
      >
        <h2 id="conflict-title" className="font-serif text-lg font-medium">
          同步冲突
        </h2>
        <p className="mt-2 text-sm text-muted">
          「{title}」本机和远端不一样。还剩 {remaining} 篇。可以按段选择。
        </p>
        <ul className="mt-4 space-y-2">
          {diffs.length === 0 ? (
            <li className="text-sm text-muted">两边正文一样。</li>
          ) : (
            diffs.map((hunk, index) => {
              const takeLocal = choices[index] !== false;
              return (
                <li key={index} className="rounded-md bg-overlay p-3 text-xs text-muted">
                  <p>本机 {clip(hunk.local)}</p>
                  <p className="mt-1">远端 {clip(hunk.remote)}</p>
                  <span className="mt-2 flex gap-2">
                    <button
                      type="button"
                      className={takeLocal ? "font-medium text-fg" : ""}
                      onClick={() =>
                        setChoices((current) => current.map((value, at) => (at === index ? true : value)))
                      }
                    >
                      用本机
                    </button>
                    <button
                      type="button"
                      className={!takeLocal ? "font-medium text-fg" : ""}
                      onClick={() =>
                        setChoices((current) => current.map((value, at) => (at === index ? false : value)))
                      }
                    >
                      用远端
                    </button>
                  </span>
                </li>
              );
            })
          )}
        </ul>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onKeepBoth}>
            都保留
          </Button>
          <Button variant="ghost" onClick={() => onMerge(applyHunks(hunks, choices.length ? choices : diffs.map(() => true)))}>
            按段合并
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
