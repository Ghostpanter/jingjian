import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { isNativeApp } from "@/lib/notes/native-folder";
import { isDesktopApp } from "@/lib/notes/desktop";
import { pickSyncFolder } from "@/lib/notes/sync-folder";
import { type SyncConfig, type SyncProvider } from "@/lib/notes/sync-types";
import {
  OSS_VENDORS,
  endpointForVendor,
  patchOssVendor,
} from "@/lib/notes/sync-oss";
import { testSync } from "@/lib/notes/sync";
import {
  applyTheme,
  DEFAULT_THEME,
  readThemeConfig,
  THEME_OPTIONS,
  themeSwatch,
  writeThemeConfig,
  type ThemeColors,
  type ThemeConfig,
  type ThemeId,
} from "@/lib/notes/theme";
import {
  applyPicgoConfig,
  DEFAULT_IMAGE_CONFIG,
  readImageConfig,
  writeImageConfig,
  type ImageConfig,
  type ImageInsertAction,
  type ImageUploader,
} from "@/lib/notes/image-config";
import { testImageUploader } from "@/lib/notes/image-upload";
import { cn } from "@/lib/utils";

const PROVIDERS: { id: SyncProvider; label: string; hint: string }[] = [
  { id: "off", label: "仅本机", hint: "不上传" },
  { id: "server", label: "静笺服务器", hint: "自建 Docker" },
  { id: "webdav", label: "WebDAV", hint: "坚果云 / 群晖" },
  { id: "folder", label: "本机目录", hint: "指定文件夹" },
  { id: "oss", label: "对象存储", hint: "云厂商存储桶" },
];

const TABS = [
  { id: "sync", label: "同步" },
  { id: "theme", label: "主题" },
  { id: "image", label: "图像" },
] as const;

type TabId = (typeof TABS)[number]["id"];

const INSERT_ACTIONS: { id: ImageInsertAction; label: string }[] = [
  { id: "none", label: "无特殊操作" },
  { id: "copy", label: "复制到本机图片目录" },
  { id: "upload", label: "上传图片" },
];

const UPLOADERS: { id: ImageUploader; label: string }[] = [
  { id: "none", label: "无" },
  { id: "github", label: "GitHub" },
  { id: "gitee", label: "Gitee" },
  { id: "smms", label: "SM.MS" },
  { id: "lsky", label: "兰空图床" },
  { id: "imgur", label: "Imgur" },
  { id: "custom", label: "自定义" },
  { id: "picgo", label: "PicGo 接口" },
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
  const [tab, setTab] = useState<TabId>("sync");
  const [draft, setDraft] = useState<SyncConfig>(config);
  const [theme, setTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [savedTheme, setSavedTheme] = useState<ThemeConfig>(DEFAULT_THEME);
  const [image, setImage] = useState<ImageConfig>(DEFAULT_IMAGE_CONFIG);
  const [busy, setBusy] = useState(false);
  const [testMessage, setTestMessage] = useState("");
  const [testError, setTestError] = useState(false);
  const native = isNativeApp();
  const desktop = isDesktopApp();

  useEffect(() => {
    if (open) {
      const currentTheme = readThemeConfig();
      setDraft(config);
      setTheme(currentTheme);
      setSavedTheme(currentTheme);
      setImage(readImageConfig());
      setTestMessage("");
      setBusy(false);
      setTab("sync");
    }
  }, [open, config]);

  if (!open) return null;

  function patch(partial: Partial<SyncConfig>) {
    setDraft((current) => ({ ...current, ...partial }));
  }

  function patchImage(partial: Partial<ImageConfig>) {
    setImage((current) => ({ ...current, ...partial }));
  }

  function patchTheme(next: ThemeConfig) {
    setTheme(next);
    applyTheme(next);
  }

  async function handleTest() {
    setBusy(true);
    setTestMessage("");
    try {
      const message =
        tab === "image" ? await testImageUploader(image) : await testSync(draft);
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

  function handleCancel() {
    applyTheme(savedTheme);
    onOpenChange(false);
  }

  function handleSave() {
    writeThemeConfig(theme);
    writeImageConfig(image);
    applyTheme(theme);
    onSave(draft);
    onOpenChange(false);
    if (draft.provider !== "off") onSyncNow();
  }

  return (
    <div
      className="dialog-overlay fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-4 sm:items-center"
      onClick={handleCancel}
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
          设置
        </h2>
        <div className="mt-3 flex gap-1 rounded-md bg-overlay p-1">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id);
                setTestMessage("");
              }}
              className={cn(
                "btn-press flex-1 rounded-sm py-2 text-sm",
                tab === item.id ? "bg-paper text-fg shadow-border" : "text-muted",
              )}
            >
              {item.label}
            </button>
          ))}
        </div>

        {tab === "sync" ? (
          <SyncPanel
            draft={draft}
            native={native}
            desktop={desktop}
            busy={busy}
            onPatch={patch}
            onPickFolder={() => void handlePickFolder()}
          />
        ) : null}
        {tab === "theme" ? (
          <ThemePanel theme={theme} onChange={patchTheme} />
        ) : null}
        {tab === "image" ? (
          <ImagePanel image={image} onChange={patchImage} />
        ) : null}

        {testMessage ? (
          <p className={cn("mt-3 text-sm", testError ? "text-danger" : "text-muted")}>
            {testMessage}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={handleCancel}>
            取消
          </Button>
          {(tab === "sync" && draft.provider !== "off") ||
          (tab === "image" && image.uploader !== "none") ? (
            <Button variant="subtle" disabled={busy} onClick={() => void handleTest()}>
              测试连接
            </Button>
          ) : null}
          <Button onClick={handleSave}>保存</Button>
        </div>
      </div>
    </div>
  );
}

function SyncPanel({
  draft,
  native,
  desktop,
  busy,
  onPatch,
  onPickFolder,
}: {
  draft: SyncConfig;
  native: boolean;
  desktop: boolean;
  busy: boolean;
  onPatch: (partial: Partial<SyncConfig>) => void;
  onPickFolder: () => void;
}) {
  return (
    <>
      <p className="mt-3 text-sm text-muted">
        输入会先写到本机。开着自动同步时，平板和电脑可以同时改同一篇云端笔记，正在写的这一篇不会被远端覆盖。
      </p>
      <div className="provider-grid mt-4">
        {PROVIDERS.map((item) => {
          const selected = draft.provider === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onPatch({ provider: item.id })}
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
              onChange={(event) => onPatch({ serverUrl: event.target.value })}
              placeholder="http://192.168.1.8:8787"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </Field>
          <Field label="访问 Token">
            <Input
              type="password"
              value={draft.serverToken}
              onChange={(event) => onPatch({ serverToken: event.target.value })}
              placeholder="与 Docker 的 JINGJIAN_TOKEN 相同"
              autoComplete="off"
            />
          </Field>
        </div>
      ) : null}
      {draft.provider === "webdav" ? (
        <div className="mt-4 flex flex-col gap-3">
          <Field label="WebDAV 地址">
            <Input
              value={draft.webdavUrl}
              onChange={(event) => onPatch({ webdavUrl: event.target.value })}
              placeholder="https://dav.jianguoyun.com/dav/"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </Field>
          <Field label="用户名">
            <Input
              value={draft.webdavUser}
              onChange={(event) => onPatch({ webdavUser: event.target.value })}
              autoCapitalize="off"
              autoCorrect="off"
            />
          </Field>
          <Field label="密码 / 应用密码">
            <Input
              type="password"
              value={draft.webdavPassword}
              onChange={(event) => onPatch({ webdavPassword: event.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field label="远程保存路径">
            <Input
              value={draft.webdavPath}
              onChange={(event) => onPatch({ webdavPath: event.target.value })}
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
              onChange={(event) => onPatch({ folderPath: event.target.value })}
              placeholder="Jingjian"
              autoCapitalize="off"
            />
          </Field>
          <p className="text-xs leading-relaxed text-muted">
            {native
              ? "点「选择文件夹」会打开系统目录。不选的话，笔记写到「文档」里的这个名字。"
              : desktop
                ? "点「选择文件夹」打开电脑上的目录。笔记以「标题 + 短 id.md」写入该文件夹。"
                : "点「选择文件夹」打开系统目录。文件名为「标题 + 短 id.md」。"}
          </p>
          <Button variant="subtle" disabled={busy} onClick={onPickFolder}>
            {busy ? "正在打开…" : "选择文件夹"}
          </Button>
        </div>
      ) : null}
      {draft.provider === "oss" ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-muted">
            选一家云厂商，笔记以 Markdown 文件写入存储桶。网页需在桶 CORS 放行当前站点；安卓与电脑应用可直连。
          </p>
          <div className="provider-grid">
            {OSS_VENDORS.map((item) => {
              const selected = draft.ossVendor === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onPatch(patchOssVendor(item.id, draft))}
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
          <Field label="Bucket">
            <Input
              value={draft.ossBucket}
              onChange={(event) => onPatch({ ossBucket: event.target.value })}
              placeholder="jingjian-notes"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </Field>
          <Field label="地域">
            <Input
              value={draft.ossRegion}
              onChange={(event) => {
                const ossRegion = event.target.value;
                const ossEndpoint =
                  draft.ossVendor === "minio"
                    ? draft.ossEndpoint
                    : endpointForVendor(draft.ossVendor, ossRegion);
                onPatch({ ossRegion, ossEndpoint });
              }}
              placeholder="cn-hangzhou"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </Field>
          <Field label="Endpoint">
            <Input
              value={draft.ossEndpoint}
              onChange={(event) => onPatch({ ossEndpoint: event.target.value })}
              placeholder="oss-cn-hangzhou.aliyuncs.com"
              autoCapitalize="off"
              autoCorrect="off"
            />
          </Field>
          <Field label="AccessKey">
            <Input
              value={draft.ossAccessKey}
              onChange={(event) => onPatch({ ossAccessKey: event.target.value })}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
            />
          </Field>
          <Field label="SecretKey">
            <Input
              type="password"
              value={draft.ossSecretKey}
              onChange={(event) => onPatch({ ossSecretKey: event.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field label="目录前缀">
            <Input
              value={draft.ossPrefix}
              onChange={(event) => onPatch({ ossPrefix: event.target.value })}
              placeholder="jingjian"
              autoCapitalize="off"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.ossPathStyle}
              onChange={(event) => onPatch({ ossPathStyle: event.target.checked })}
            />
            Path-style 访问（MinIO / 部分兼容接口需要）
          </label>
        </div>
      ) : null}
      {draft.provider !== "off" ? (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.autoSync}
            onChange={(event) => onPatch({ autoSync: event.target.checked })}
          />
          自动同步
        </label>
      ) : null}
    </>
  );
}

function ThemePanel({
  theme,
  onChange,
}: {
  theme: ThemeConfig;
  onChange: (theme: ThemeConfig) => void;
}) {
  const custom = theme.id === "custom-light" || theme.id === "custom-dark";
  const colors = theme.id === "custom-dark" ? theme.customDark : theme.customLight;
  function patchColors(partial: Partial<ThemeColors>) {
    if (theme.id === "custom-dark") {
      onChange({ ...theme, customDark: { ...theme.customDark, ...partial } });
      return;
    }
    onChange({ ...theme, customLight: { ...theme.customLight, ...partial } });
  }
  return (
    <>
      <p className="mt-3 text-sm text-muted">
        宣纸是默认。代码关键字、字符串、函数用独立高对比配色，不再混进正文颜色，浅底也能看清。整体最清楚的是 GitHub 夜间。
      </p>
      <div className="provider-grid mt-4">
        {THEME_OPTIONS.map((item) => {
          const selected = theme.id === item.id;
          const swatch = themeSwatch(theme, item.id as ThemeId);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onChange({ ...theme, id: item.id as ThemeId })}
              className={cn(
                "btn-press rounded-md px-3 py-2 text-left",
                selected ? "bg-paper text-fg shadow-border" : "bg-overlay text-muted",
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className="theme-swatch"
                  style={{
                    background: swatch.bg,
                    color: swatch.fg,
                    boxShadow: `inset 0 0 0 1px ${swatch.accent}`,
                  }}
                  aria-hidden
                >
                  文
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium text-fg">{item.label}</div>
                  <div className="text-xs text-subtle">{item.hint}</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {custom ? (
        <div className="mt-4 grid grid-cols-3 gap-3">
          <ColorField
            label="纸色"
            value={colors.bg}
            onChange={(bg) => patchColors({ bg })}
          />
          <ColorField
            label="字色"
            value={colors.fg}
            onChange={(fg) => patchColors({ fg })}
          />
          <ColorField
            label="强调色"
            value={colors.accent}
            onChange={(accent) => patchColors({ accent })}
          />
        </div>
      ) : null}
    </>
  );
}

function ImagePanel({
  image,
  onChange,
}: {
  image: ImageConfig;
  onChange: (partial: Partial<ImageConfig>) => void;
}) {
  const [picgoRaw, setPicgoRaw] = useState("");
  const [picgoHint, setPicgoHint] = useState("");

  function importPicgo() {
    try {
      const next = applyPicgoConfig(picgoRaw, image);
      onChange(next);
      setPicgoHint(`已导入 ${next.uploader} 图床，保存后生效`);
    } catch (error) {
      setPicgoHint(error instanceof Error ? error.message : "无法解析 PicGo 配置");
    }
  }

  return (
    <>
      <Field label="插入图片时">
        <select
          className="h-11 w-full rounded-md bg-overlay px-3 text-sm text-fg"
          value={image.insertAction}
          onChange={(event) =>
            onChange({ insertAction: event.target.value as ImageInsertAction })
          }
        >
          {INSERT_ACTIONS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={image.applyToLocal}
          onChange={(event) => onChange({ applyToLocal: event.target.checked })}
        />
        对本机位置的图片应用上述规则
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={image.applyToRemote}
          onChange={(event) => onChange({ applyToRemote: event.target.checked })}
        />
        对网络位置的图片应用上述规则
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={image.yamlUpload}
          onChange={(event) => onChange({ yamlUpload: event.target.checked })}
        />
        允许根据 YAML 设置自动上传图片
      </label>
      <div className="mt-4 text-xs text-muted">图片语法偏好</div>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={image.preferRelative}
          onChange={(event) => onChange({ preferRelative: event.target.checked })}
        />
        优先使用相对路径
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={image.relativeDotSlash}
          disabled={!image.preferRelative}
          onChange={(event) => onChange({ relativeDotSlash: event.target.checked })}
        />
        为相对路径添加 ./
      </label>
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={image.escapeUrl}
          onChange={(event) => onChange({ escapeUrl: event.target.checked })}
        />
        插入时自动转义图片 URL
      </label>
      <div className="mt-4 text-xs text-muted">上传服务设定</div>
      <Field label="上传服务">
        <select
          className="h-11 w-full rounded-md bg-overlay px-3 text-sm text-fg"
          value={image.uploader}
          onChange={(event) =>
            onChange({ uploader: event.target.value as ImageUploader })
          }
        >
          {UPLOADERS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      {image.uploader === "github" ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="Token">
            <Input
              type="password"
              value={image.githubToken}
              onChange={(event) => onChange({ githubToken: event.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field label="仓库 owner/repo">
            <Input
              value={image.githubRepo}
              onChange={(event) => onChange({ githubRepo: event.target.value })}
              placeholder="Ghostpanter/pic"
              autoCapitalize="off"
            />
          </Field>
          <Field label="分支">
            <Input
              value={image.githubBranch}
              onChange={(event) => onChange({ githubBranch: event.target.value })}
              autoCapitalize="off"
            />
          </Field>
          <Field label="保存路径">
            <Input
              value={image.githubPath}
              onChange={(event) => onChange({ githubPath: event.target.value })}
              placeholder="jingjian"
              autoCapitalize="off"
            />
          </Field>
          <Field label="链接格式">
            <select
              className="h-11 w-full rounded-md bg-overlay px-3 text-sm text-fg"
              value={image.githubLink}
              onChange={(event) =>
                onChange({
                  githubLink: event.target.value as ImageConfig["githubLink"],
                })
              }
            >
              <option value="jsdelivr">jsDelivr</option>
              <option value="raw">GitHub Raw</option>
              <option value="custom">自定义域名</option>
            </select>
          </Field>
          {image.githubLink === "custom" ? (
            <Field label="自定义域名">
              <Input
                value={image.githubDomain}
                onChange={(event) => onChange({ githubDomain: event.target.value })}
                placeholder="https://img.example.com"
                autoCapitalize="off"
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      {image.uploader === "gitee" ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="私人令牌">
            <Input
              type="password"
              value={image.giteeToken}
              onChange={(event) => onChange({ giteeToken: event.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field label="仓库 owner/repo">
            <Input
              value={image.giteeRepo}
              onChange={(event) => onChange({ giteeRepo: event.target.value })}
              placeholder="username/pic"
              autoCapitalize="off"
            />
          </Field>
          <Field label="分支">
            <Input
              value={image.giteeBranch}
              onChange={(event) => onChange({ giteeBranch: event.target.value })}
              autoCapitalize="off"
            />
          </Field>
          <Field label="保存路径">
            <Input
              value={image.giteePath}
              onChange={(event) => onChange({ giteePath: event.target.value })}
              placeholder="jingjian"
              autoCapitalize="off"
            />
          </Field>
        </div>
      ) : null}
      {image.uploader === "smms" ? (
        <div className="mt-3">
          <Field label="SM.MS Token">
            <Input
              type="password"
              value={image.smmsToken}
              onChange={(event) => onChange({ smmsToken: event.target.value })}
              autoComplete="off"
            />
          </Field>
        </div>
      ) : null}
      {image.uploader === "lsky" ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="兰空地址">
            <Input
              value={image.lskyUrl}
              onChange={(event) => onChange({ lskyUrl: event.target.value })}
              placeholder="https://your-lsky.example"
              autoCapitalize="off"
            />
          </Field>
          <Field label="Token">
            <Input
              type="password"
              value={image.lskyToken}
              onChange={(event) => onChange({ lskyToken: event.target.value })}
              autoComplete="off"
            />
          </Field>
        </div>
      ) : null}
      {image.uploader === "imgur" ? (
        <div className="mt-3">
          <Field label="Client ID">
            <Input
              value={image.imgurClientId}
              onChange={(event) => onChange({ imgurClientId: event.target.value })}
              placeholder="Imgur 应用的 Client ID"
              autoCapitalize="off"
              autoComplete="off"
            />
          </Field>
        </div>
      ) : null}
      {image.uploader === "picgo" ? (
        <div className="mt-3">
          <Field label="PicGo 接口">
            <Input
              value={image.picgoUrl}
              onChange={(event) => onChange({ picgoUrl: event.target.value })}
              placeholder="http://127.0.0.1:36677/upload"
              autoCapitalize="off"
            />
          </Field>
          <p className="mt-2 text-xs text-muted">
            仅电脑本机开着 PicGo 时可用。平板请选 GitHub、Gitee、SM.MS、兰空、Imgur 或自定义，或把 PicGo 的 data.json 粘到下方导入。
          </p>
        </div>
      ) : null}
      {image.uploader === "custom" ? (
        <div className="mt-3 flex flex-col gap-3">
          <Field label="上传地址">
            <Input
              value={image.customUrl}
              onChange={(event) => onChange({ customUrl: event.target.value })}
              placeholder="https://example.com/upload"
              autoCapitalize="off"
            />
          </Field>
          <Field label="Token / Authorization">
            <Input
              type="password"
              value={image.customToken}
              onChange={(event) => onChange({ customToken: event.target.value })}
              autoComplete="off"
            />
          </Field>
          <Field label="文件字段名">
            <Input
              value={image.customFileField}
              onChange={(event) => onChange({ customFileField: event.target.value })}
              placeholder="file"
              autoCapitalize="off"
            />
          </Field>
          <Field label="图片 URL 路径">
            <Input
              value={image.customUrlPath}
              onChange={(event) => onChange({ customUrlPath: event.target.value })}
              placeholder="data.url"
              autoCapitalize="off"
            />
          </Field>
        </div>
      ) : null}
      <div className="mt-5 text-xs text-muted">从 PicGo 配置导入</div>
      <textarea
        value={picgoRaw}
        onChange={(event) => setPicgoRaw(event.target.value)}
        placeholder='粘贴 PicGo 的 data.json，例如 { "picBed": { "current": "github", "github": { ... } } }'
        className="mt-2 h-24 w-full resize-y rounded-md bg-overlay px-3 py-2 font-mono text-xs text-fg outline-none focus-visible:ring-2 focus-visible:ring-ring"
        spellCheck={false}
        autoCapitalize="off"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted">{picgoHint}</p>
        <Button variant="subtle" size="sm" type="button" onClick={importPicgo}>
          导入
        </Button>
      </div>
    </>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#f7f3eb";
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={hex}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-11 shrink-0 cursor-pointer rounded-md bg-overlay p-1"
          aria-label={label}
        />
        <Input
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={`${label}色值`}
          className="h-11 font-mono text-sm"
        />
      </div>
    </label>
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
    <label className="mt-3 block">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      {children}
    </label>
  );
}
