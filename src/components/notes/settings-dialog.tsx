import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isNativeApp } from "@/lib/notes/native-folder";
import { pickSyncFolder } from "@/lib/notes/sync-folder";
import { type SyncConfig, type SyncProvider } from "@/lib/notes/sync-types";
import { testSync } from "@/lib/notes/sync";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: SyncProvider; label: string; hint: string }[] = [
  { id: "off", label: "仅本机", hint: "不上传" },
  { id: "server", label: "静笺服务器", hint: "自建 Docker" },
  { id: "webdav", label: "WebDAV", hint: "坚果云 / 群晖" },
  { id: "folder", label: "本机目录", hint: "指定文件夹" },
];

type SettingsDialogProps = {
  open: boolean;
  config: SyncConfig;
  onOpenChange: (open: boolean) => void;
  onSave: (config: SyncConfig) => void;
  onSyncNow: () => void;
};

export function SettingsDialog({
  open,
  config,
  onOpenChange,
  onSave,
  onSyncNow,
}: SettingsDialogProps) {
  const [draft, setDraft] = useState<SyncConfig>(config);
  const [busy, setBusy] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testError, setTestError] = useState(false);
  const native = isNativeApp();

  useEffect(() => {
    if (open) {
      setDraft(config);
      setTestMessage("");
      setBusy(false);
    }
  }, [open, config]);

  if (!open) return null;

  function patch(partial: Partial<SyncConfig>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  async function handleTest() {
    setBusy(true);
    setTestMessage("");
    try {
      const message = await testSync(draft);
      setTestError(false);
      setTestMessage(message);
    } catch (error) {
      setTestError(true);
      setTestMessage(error instanceof Error ? error.message : "连接失败");
    } finally {
      setBusy(false);
    }
  }

  async function handlePickFolder() {
    setBusy(true);
    setTestError(false);
    setTestMessage("正在打开文件夹…");
    try {
      const name = await pickSyncFolder();
      patch({ folderPath: name, provider: "folder" });
      setTestError(false);
      setTestMessage(`已选择 ${name}`);
      toast.message(`已选择 ${name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setTestMessage("");
        return;
      }
      const message = error instanceof Error ? error.message : "无法选择文件夹";
      setTestError(true);
      setTestMessage(message);
      toast.message(message);
    } finally {
      setBusy(false);
    }
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
        aria-labelledby="settings-title"
        className="settings-dialog dialog-content w-full max-w-lg rounded-xl bg-bg p-5 text-fg shadow-raised sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="settings-title" className="font-serif text-lg font-medium">
          同步与保存路径
        </h2>
        <p className="mt-1 text-sm text-muted">
          输入会先写到本机，再按最后修改时间与远端对齐。没有打开 / 保存菜单。
        </p>

        <div className="provider-grid mt-4">
          {PROVIDERS.map((item) => {
            const selected = draft.provider === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => patch({ provider: item.id })}
                className={cn(
                  "btn-press rounded-md px-3 py-2 text-left",
                  selected ? "bg-paper text-fg shadow-border" : "bg-overlay text-muted",
                )}
              >
                <div className="text-sm font-medium text-fg">{item.label}</div>
                <div className="text-xs text-subtle">{item.hint}</div>
              </button>
            );
          })}
        </div>

        {draft.provider === "server" ? (
          <div className="mt-4 flex flex-col gap-3">
            <Field label="服务器地址">
              <Input
                value={draft.serverUrl}
                onChange={(event) => patch({ serverUrl: event.target.value })}
                placeholder="http://192.168.1.8:8787"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </Field>
            <Field label="访问 Token">
              <Input
                type="password"
                value={draft.serverToken}
                onChange={(event) => patch({ serverToken: event.target.value })}
                placeholder="与 Docker 的 JINGJIAN_TOKEN 相同"
                autoComplete="off"
              />
            </Field>
            <p className="text-xs leading-relaxed text-muted">
              保存路径在服务器上指定，例如 docker-compose 里的
              <span className="text-fg"> JINGJIAN_NOTES_PATH</span>
              。目录里是普通 Markdown，可用 Typora 打开同一文件夹。
            </p>
          </div>
        ) : null}

        {draft.provider === "webdav" ? (
          <div className="mt-4 flex flex-col gap-3">
            <Field label="WebDAV 地址">
              <Input
                value={draft.webdavUrl}
                onChange={(event) => patch({ webdavUrl: event.target.value })}
                placeholder="https://dav.jianguoyun.com/dav/"
                autoCapitalize="off"
                autoCorrect="off"
              />
            </Field>
            <Field label="用户名">
              <Input
                value={draft.webdavUser}
                onChange={(event) => patch({ webdavUser: event.target.value })}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </Field>
            <Field label="密码 / 应用密码">
              <Input
                type="password"
                value={draft.webdavPassword}
                onChange={(event) => patch({ webdavPassword: event.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label="远程保存路径">
              <Input
                value={draft.webdavPath}
                onChange={(event) => patch({ webdavPath: event.target.value })}
                placeholder="/静笺"
                autoCapitalize="off"
              />
            </Field>
          </div>
        ) : null}

        {draft.provider === "folder" ? (
          <div className="mt-4 flex flex-col gap-3">
            <Field label="保存路径">
              <Input
                value={draft.folderPath}
                onChange={(event) => patch({ folderPath: event.target.value })}
                placeholder="Jingjian"
                autoCapitalize="off"
              />
            </Field>
            <p className="text-xs leading-relaxed text-muted">
              {native
                ? "点「选择文件夹」会打开系统目录。不选的话，笔记写到「文档」里的这个名字。"
                : "点「选择文件夹」打开系统目录。文件名为「标题 + 短 id.md」。"}
            </p>
            <Button variant="subtle" disabled={busy} onClick={() => void handlePickFolder()}>
              {busy ? "正在打开…" : "选择文件夹"}
            </Button>
          </div>
        ) : null}

        {draft.provider !== "off" ? (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.autoSync}
              onChange={(event) => patch({ autoSync: event.target.checked })}
            />
            自动同步
          </label>
        ) : null}

        {testMessage ? (
          <p className={cn("mt-3 text-sm", testError ? "text-danger" : "text-muted")}>
            {testMessage}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {draft.provider !== "off" ? (
            <Button variant="subtle" disabled={busy} onClick={() => void handleTest()}>
              测试连接
            </Button>
          ) : null}
          <Button
            onClick={() => {
              onSave(draft);
              onOpenChange(false);
              if (draft.provider !== "off") onSyncNow();
            }}
          >
            保存
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
