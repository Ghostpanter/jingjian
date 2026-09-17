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
import { bodyAfterFrontMatter } from "@/lib/notes/format";

type BlogPostsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  localIdForPath: (path: string) => string | null;
  onOpenLocal: (id: string) => void;
  onPull: (file: BlogPostFile, existingId: string | null) => void | Promise<void>;
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
}: BlogPostsDialogProps) {
  const [posts, setPosts] = useState<BlogPostItem[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<BlogPostItem | null>(null);
  const [file, setFile] = useState<BlogPostFile | null>(null);
  const [postsDir, setPostsDir] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(null);
    setFile(null);
    setError("");
    const config = readBlogConfig();
    setPostsDir(config.postsDir.trim());
    if (!isBlogConfigured(config)) {
      setPosts([]);
      setError("先在设置里填写博客仓库");
      return;
    }
    let cancelled = false;
    setLoading(true);
    void listBlogPosts(config)
      .then((items) => {
        if (cancelled) return;
        setPosts(items);
      })
      .catch((caught) => {
        if (cancelled) return;
        setPosts([]);
        setError(caught instanceof Error ? caught.message : "无法列出文章");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return posts;
    return posts.filter((item) => {
      const title = titleFromPostName(item.path).toLowerCase();
      return title.includes(needle) || item.path.toLowerCase().includes(needle);
    });
  }, [posts, query]);

  if (!open) return null;

  const localId = selected ? localIdForPath(selected.path) : null;
  const title = file
    ? titleFromPostContent(file.content, titleFromPostName(file.path))
    : selected
      ? titleFromPostName(selected.path)
      : "";

  async function openPost(item: BlogPostItem) {
    setSelected(item);
    setFile(null);
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

  async function pull(existingId: string | null) {
    if (!file || pulling) return;
    setPulling(true);
    setError("");
    try {
      await onPull(file, existingId);
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
          {selected ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelected(null);
                setFile(null);
                setError("");
              }}
            >
              返回
            </Button>
          ) : null}
          <h2 id="blog-posts-title" className="min-w-0 flex-1 truncate font-serif text-lg font-medium">
            {selected ? title : "仓库文章"}
          </h2>
        </div>

        {selected ? (
          <p className="mt-1 truncate text-xs text-muted">
            {relativePostPath(selected.path, postsDir)}
          </p>
        ) : null}

        {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}

        {selected ? (
          <>
            <div className="mt-3 min-h-64 flex-1 overflow-hidden rounded-md bg-paper shadow-border">
              {reading && !file ? (
                <p className="px-4 py-10 text-center text-sm text-muted">正在打开…</p>
              ) : file ? (
                <PreviewPane
                  previewId="blog-post-preview"
                  content={bodyAfterFrontMatter(file.content)}
                />
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              {localId ? (
                <>
                  <Button
                    variant="subtle"
                    disabled={pulling || !file}
                    onClick={() => {
                      onOpenLocal(localId);
                      onOpenChange(false);
                    }}
                  >
                    打开本地
                  </Button>
                  <Button disabled={pulling || !file} onClick={() => void pull(localId)}>
                    {pulling ? "正在覆盖…" : "用仓库覆盖"}
                  </Button>
                </>
              ) : (
                <Button disabled={pulling || !file} onClick={() => void pull(null)}>
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
            {posts.length >= 8 ? (
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
              ) : (
                filtered.map((item) => {
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
                          {local
                            ? "已在本地 · "
                            : ""}
                          {relativePostPath(item.path, postsDir)}
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
