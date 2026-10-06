import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PreviewPane } from "@/components/notes/preview-pane";
import { isBlogConfigured, readBlogConfig } from "@/lib/notes/blog-config";
import {
  listBlogPosts,
  readBlogPost,
  titleFromPostContent,
  titleFromPostName,
  type BlogPostFile,
  type BlogPostItem,
} from "@/lib/notes/blog-publish";
import {
  listRemotePosts,
  readRemotePost,
  type RemotePost,
  type RemotePostFile,
} from "@/lib/notes/blog-platform-publish";
import {
  BLOG_PLATFORMS,
  gitReady,
  noteIdForTarget,
  platformEnabled,
  platformLabel,
  platformReady,
  readPlatformPrefs,
  type PlatformId,
} from "@/lib/notes/blog-platforms";
import { bodyAfterFrontMatter } from "@/lib/notes/format";

type BlogPostsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localIdForPath: (path: string) => string | null;
  onOpenLocal: (id: string) => void;
  onPull: (file: BlogPostFile, existingId: string | null) => void | Promise<void>;
  onPullRemote?: (file: RemotePostFile & { platform: Exclude<PlatformId, "git"> }) => void | Promise<void>;
};

function relativePostPath(path: string, postsDir: string): string {
  const prefix = postsDir.replace(/^\/+|\/+$/g, "");
  if (prefix && (path === prefix || path.startsWith(`${prefix}/`))) {
    return path.slice(prefix.length).replace(/^\/+/, "") || path;
  }
  return path;
}

export function BlogPostsDialog({
  open,
  onOpenChange,
  localIdForPath,
  onOpenLocal,
  onPull,
  onPullRemote,
}: BlogPostsDialogProps) {
  const [platform, setPlatform] = useState<PlatformId>("git");
  const [ready, setReady] = useState<PlatformId[]>([]);
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [remote, setRemote] = useState<RemotePost[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BlogPostItem | null>(null);
  const [file, setFile] = useState<BlogPostFile | null>(null);
  const [remoteFile, setRemoteFile] = useState<(RemotePostFile & { platform: Exclude<PlatformId, "git"> }) | null>(null);
  const [postsDir, setPostsDir] = useState("");

  useEffect(() => {
    if (!open) return;
    const prefs = readPlatformPrefs();
    const config = readBlogConfig();
    const ids = BLOG_PLATFORMS.map((item) => item.id).filter(
      (id) => platformEnabled(prefs, id, gitReady(config)) && platformReady(prefs, id, config),
    );
    setReady(ids);
    setPlatform((current) => (ids.includes(current) ? current : ids[0] ?? "git"));
    setPostsDir(config.postsDir.trim());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setFile(null);
    setRemoteFile(null);
    setError("");
    setPosts([]);
    setRemote([]);
    const prefs = readPlatformPrefs();
    const config = readBlogConfig();
    if (platform === "git" && !isBlogConfigured(config)) {
      setError("先在设置里填写博客仓库");
      return;
    }
    let cancelled = false;
    setLoading(true);
    const task =
      platform === "git"
        ? listBlogPosts(config).then((items) => {
            if (!cancelled) setPosts(items);
          })
        : listRemotePosts(platform, prefs).then((items) => {
            if (!cancelled) setRemote(items);
          });
    void task
      .catch((caught) => {
        if (cancelled) return;
        setError(caught instanceof Error ? caught.message : "无法列出文章");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, platform]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (platform !== "git") {
      if (!needle) return remote;
      return remote.filter((item) => item.title.toLowerCase().includes(needle) || item.url.toLowerCase().includes(needle));
    }
    if (!needle) return posts;
    return posts.filter((item) => {
      const title = titleFromPostName(item.path).toLowerCase();
      return title.includes(needle) || item.path.toLowerCase().includes(needle);
    });
  }, [platform, posts, remote, query]);

  if (!open) return null;

  const localId = selected ? localIdForPath(selected.path) : remoteFile ? noteIdForTarget(remoteFile.platform, remoteFile.remoteId) : null;
  const title = remoteFile
    ? remoteFile.title
    : file
      ? titleFromPostContent(file.content, titleFromPostName(file.path))
      : selected
        ? titleFromPostName(selected.path)
        : "";

  async function openPost(item: BlogPostItem) {
    setSelected(item);
    setFile(null);
    setRemoteFile(null);
    setError("");
    setReading(true);
    try {
      const next = await readBlogPost(item.path);
      setFile(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法打开文章");
    } finally {
      setReading(false);
    }
  }

  async function openRemote(item: RemotePost) {
    if (platform === "git") return;
    setSelected(null);
    setFile(null);
    setRemoteFile(null);
    setError("");
    setReading(true);
    try {
      const next = await readRemotePost(platform, readPlatformPrefs(), item.remoteId);
      setRemoteFile({ ...next, platform });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法打开文章");
    } finally {
      setReading(false);
    }
  }

  async function pull(existingId: string | null) {
    if (pulling) return;
    if (!file && !remoteFile) return;
    setPulling(true);
    setError("");
    try {
      if (remoteFile) await onPullRemote?.(remoteFile);
      else if (file) await onPull(file, existingId);
      onOpenChange(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "无法拉进本地");
    } finally {
      setPulling(false);
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
        aria-labelledby="blog-posts-title"
        className="blog-posts-dialog dialog-content flex w-full max-w-lg flex-col rounded-xl bg-bg p-5 text-fg shadow-raised"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          {selected || remoteFile ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                setFile(null);
                setRemoteFile(null);
                setError("");
              }}
            >
              返回
            </Button>
          ) : null}
          <h2 id="blog-posts-title" className="min-w-0 flex-1 truncate font-serif text-lg font-medium">
            {selected ? title : remoteFile ? title : "已发文章"}
          </h2>
        </div>

        {selected ? (
          <p className="mt-1 truncate text-xs text-muted">
            {relativePostPath(selected.path, postsDir)}
          </p>
        ) : remoteFile ? (
          <p className="mt-1 truncate text-xs text-muted">{remoteFile.url}</p>
        ) : ready.length > 1 ? (
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {ready.map((id) => (
              <button
                key={id}
                type="button"
                className={
                  id === platform
                    ? "btn-press shrink-0 rounded-md bg-paper px-2 py-1 text-xs text-fg shadow-border"
                    : "btn-press shrink-0 rounded-md px-2 py-1 text-xs text-muted"
                }
                onClick={() => setPlatform(id)}
              >
                {platformLabel(id)}
              </button>
            ))}
          </div>
        ) : null}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        {selected || remoteFile || (reading && !selected) ? (
          <>
            <div className="mt-3 min-h-64 flex-1 overflow-hidden rounded-md bg-paper shadow-border">
              {reading && !file && !remoteFile ? (
                <p className="px-4 py-10 text-center text-sm text-muted">正在打开…</p>
              ) : file || remoteFile ? (
                <PreviewPane
                  previewId="blog-post-preview"
                  content={bodyAfterFrontMatter(file?.content || remoteFile?.content || "")}
                />
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {localId ? (
                <>
                  <Button
                    variant="subtle"
                    disabled={pulling || (!file && !remoteFile)}
                    onClick={() => {
                      onOpenLocal(localId);
                      onOpenChange(false);
                    }}
                  >
                    打开本地
                  </Button>
                  <Button disabled={pulling || (!file && !remoteFile)} onClick={() => void pull(localId)}>
                    {pulling ? "正在覆盖…" : "用仓库覆盖"}
                  </Button>
                </>
              ) : (
                <Button disabled={pulling || (!file && !remoteFile)} onClick={() => void pull(null)}>
                  {pulling ? "正在拉取…" : "拉进本地"}
                </Button>
              )}
              <Button variant="subtle" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </>
        ) : (
          <>
            {(platform === "git" ? posts.length : remote.length) >= 8 ? (
              <div className="mt-3">
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="搜索文章"
                  aria-label="搜索文章"
                  autoComplete="off"
                />
              </div>
            ) : null}
            <ul className="mt-3 min-h-0 flex-1 overflow-y-auto">
              {loading ? (
                <li className="py-6 text-center text-sm text-muted">正在列出文章…</li>
              ) : filtered.length === 0 ? (
                <li className="py-6 text-center text-sm text-muted">
                  {query.trim() ? "没有匹配的文章" : error ? "" : "文章目录是空的"}
                </li>
              ) : platform === "git" ? (
                posts
                  .filter((item) => {
                    const needle = query.trim().toLowerCase();
                    if (!needle) return true;
                    const title = titleFromPostName(item.path).toLowerCase();
                    return title.includes(needle) || item.path.toLowerCase().includes(needle);
                  })
                  .map((item) => {
                  const local = localIdForPath(item.path);
                  return (
                    <li key={item.path} className="border-b border-border last:border-0">
                      <button
                        type="button"
                        className="btn-press flex min-h-11 w-full flex-col items-start py-2 text-left"
                        onClick={() => void openPost(item)}
                      >
                        <span className="w-full truncate font-serif text-sm">
                          {titleFromPostName(item.path)}
                        </span>
                        <span className="w-full truncate text-xs text-muted">
                          {local ? "已在本地 · " : ""}
                          {relativePostPath(item.path, postsDir)}
                        </span>
                      </button>
                    </li>
                  );
                })
              ) : (
                remote
                  .filter((item) => {
                    const needle = query.trim().toLowerCase();
                    if (!needle) return true;
                    return item.title.toLowerCase().includes(needle) || item.url.toLowerCase().includes(needle);
                  })
                  .map((item) => {
                    const local = noteIdForTarget(platform, item.remoteId);
                    return (
                      <li key={item.remoteId} className="border-b border-border last:border-0">
                        <button
                          type="button"
                          className="btn-press flex min-h-11 w-full flex-col items-start py-2 text-left"
                          onClick={() => void openRemote(item)}
                        >
                          <span className="w-full truncate font-serif text-sm">{item.title}</span>
                          <span className="w-full truncate text-xs text-muted">
                            {local ? "已在本地 · " : ""}
                            {item.hint}
                          </span>
                        </button>
                      </li>
                    );
                  })
              )}
            </ul>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="subtle" onClick={() => onOpenChange(false)}>
                关闭
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
