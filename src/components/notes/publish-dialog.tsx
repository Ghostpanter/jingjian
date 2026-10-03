import { Button } from "@/components/ui/button";
import { platformLabel, platformReady, type PlatformId, type PlatformPrefs } from "@/lib/notes/blog-platforms";
import type { BlogConfig } from "@/lib/notes/blog-config";

type PublishDialogProps = {
  open: boolean;
  prefs: PlatformPrefs;
  blog: BlogConfig;
  ids: PlatformId[];
  picked: PlatformId[];
  busy: boolean;
  onPicked: (ids: PlatformId[]) => void;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  onConfigure: (id: PlatformId) => void;
};

export function PublishDialog({
  open,
  prefs,
  blog,
  ids,
  picked,
  busy,
  onPicked,
  onConfirm,
  onOpenChange,
  onConfigure,
}: PublishDialogProps) {
  if (!open) return null;
  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={() => {
        if (!busy) onOpenChange(false);
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        className="dialog-content w-full max-w-sm rounded-xl bg-bg p-6 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="publish-title" className="font-serif text-lg font-medium">
          发布到
        </h2>
        <p className="mt-2 text-sm text-muted">可多选。没有勾过默认平台时，在这里选这一次要发去哪。</p>
        <ul className="mt-4 divide-y divide-border">
          {ids.map((id) => {
            const ready = platformReady(prefs, id, blog);
            const checked = picked.includes(id);
            return (
              <li key={id} className="flex items-center justify-between gap-3 py-2.5">
                <label className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!ready || busy}
                    onChange={() => {
                      onPicked(checked ? picked.filter((item) => item !== id) : [...picked, id]);
                    }}
                  />
                  <span className="truncate">{platformLabel(id)}</span>
                </label>
                {ready ? null : (
                  <button
                    type="button"
                    className="shrink-0 text-xs text-muted underline"
                    onClick={() => onConfigure(id)}
                  >
                    去填写
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={busy || picked.length === 0} onClick={onConfirm}>
            {busy ? "正在发布" : "发布"}
          </Button>
        </div>
      </div>
    </div>
  );
}
