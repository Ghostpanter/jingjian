import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronRight, ChevronsDownUp, Newspaper, Plus, Search, Settings, Trash2, X } from "lucide-react";
import { CreateMenu } from "@/components/notes/create-menu";
import { FileTree } from "@/components/notes/file-tree";
import { OutlineList } from "@/components/notes/outline-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ancestorFolders, buildFileTree } from "@/lib/notes/folder-tree";
import {
  formatRelativeTime,
  groupNotes,
  NOTE_SORTS,
  parseOpenIds,
  readOpened,
  readStars,
  titleFromContent,
  toggleOpenId,
  toggleStar,
  type NoteSort,
} from "@/lib/notes/format";
import type { OutlineHeading } from "@/lib/notes/outline";
import { chapterProgress, lastReadChapter } from "@/lib/notes/reader-progress";
import { noteLinks, unlinkedMentions } from "@/lib/notes/wiki-links";
import { libraryTags, tagMatches } from "@/lib/notes/tags";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const OPEN_KEY = "jingjian.folders.open.v1";
const BOOKS_OPEN_KEY = "jingjian.books.open.v1";
const BOOKS_SECTION_KEY = "jingjian.books.section.v1";
const SNIPPETS_KEY = "jingjian.sidebar.snippets.v1";
const PANE_KEY = "jingjian.sidebar.pane.v1";
const TAGS_SECTION_KEY = "jingjian.tags.section.v1";

type SidebarPane = "files" | "outline" | "links";

function readOpenFolders(): Set<string> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw == null) return new Set(["手册"]);
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? new Set(parsed.filter((item) => typeof item === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function writeOpenFolders(open: Set<string>) {
  try {
    localStorage.setItem(OPEN_KEY, JSON.stringify([...open]));
  } catch {
    // private mode
  }
}

function readOpenBooks(): Set<string> {
  try {
    const raw = localStorage.getItem(BOOKS_OPEN_KEY);
    if (raw == null) return new Set();
    return parseOpenIds(JSON.parse(raw) as unknown);
  } catch {
    return new Set();
  }
}

function writeOpenBooks(open: Set<string>) {
  try {
    localStorage.setItem(BOOKS_OPEN_KEY, JSON.stringify([...open]));
  } catch {
    // private mode
  }
}

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    return raw === "1";
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, value: boolean) {
  try {
    localStorage.setItem(key, value ? "1" : "0");
  } catch {
    // private mode
  }
}

function readPane(): SidebarPane {
  try {
    const raw = localStorage.getItem(PANE_KEY);
    if (raw === "outline" || raw === "links") return raw;
    return "files";
  } catch {
    return "files";
  }
}

function writePane(pane: SidebarPane) {
  try {
    localStorage.setItem(PANE_KEY, pane);
  } catch {
    // private mode
  }
}

type SidebarProps = {
  notes: Note[];
  folders: string[];
  activeId: string | null;
  activeFolder: string;
  query: string;
  now: number;
  headings: OutlineHeading[];
  activeHeadingId?: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onSelectFolder: (path: string) => void;
  onCreate: () => void;
  onCreateText: () => void;
  onCreateFolder: () => void;
  onCreateFromTemplate: (id: string) => void;
  onCreateInFolder: (path: string) => void;
  onImportMarkdown: () => void;
  onImportTxt: () => void;
  onImportFolder: () => void;
  onImportEpub: () => void;
  onMakeBook: () => void;
  onAddChapter: () => void;
  onMoveNote: (id: string, folder: string | null) => void;
  onNoteMenu: (note: Note) => void;
  onFolderMenu: (path: string) => void;
  onJumpHeading: (heading: OutlineHeading) => void;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  onOpenTrash: () => void;
  onOpenBlog: () => void;
  onOpenGraph: () => void;
  sort: NoteSort;
  onSortChange: (sort: NoteSort) => void;
  onOpenToday?: () => void;
  onReadBook?: (noteId: string) => void;
  syncLabel: string;
};

export function Sidebar({
  notes,
  folders,
  activeId,
  activeFolder,
  query,
  now,
  headings,
  activeHeadingId,
  onQueryChange,
  onSelect,
  onSelectFolder,
  onCreate,
  onCreateText,
  onCreateFolder,
  onCreateFromTemplate,
  onCreateInFolder,
  onImportMarkdown,
  onImportTxt,
  onImportFolder,
  onImportEpub,
  onMakeBook,
  onAddChapter,
  onMoveNote,
  onNoteMenu,
  onFolderMenu,
  onJumpHeading,
  onCloseMobile,
  onOpenSettings,
  onOpenTrash,
  onOpenBlog,
  onOpenGraph,
  sort,
  onSortChange,
  onOpenToday,
  onReadBook,
  syncLabel,
}: SidebarProps) {
  const groups = groupNotes(notes);
  const books = groups.filter((group) => group.book);
  const treeNotes = notes.filter((note) => !note.bookId);
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(readOpenFolders);
  const [openBooks, setOpenBooks] = useState<Set<string>>(readOpenBooks);
  const [booksSectionOpen, setBooksSectionOpen] = useState(() => readFlag(BOOKS_SECTION_KEY, true));
  const [pane, setPane] = useState<SidebarPane>(readPane);
  const [snippets, setSnippets] = useState(() => readFlag(SNIPPETS_KEY, false));
  const [searchOpen, setSearchOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(() => readFlag(TAGS_SECTION_KEY, false));
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [stars, setStars] = useState<Set<string>>(() => new Set());
  const [opened, setOpened] = useState<Record<string, number>>({});
  const tree = useMemo(
    () => buildFileTree(treeNotes, folders, sort, { opened, stars }),
    [treeNotes, folders, sort, opened, stars],
  );
  const createBtnRef = useRef<HTMLDivElement>(null);
  const treeRef = useRef<HTMLElement>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const active = notes.find((note) => note.id === activeId);
  const hasBook = Boolean(active?.bookId);
  const canMakeBook = Boolean(active) && !active?.bookId;
  const searching = Boolean(query.trim());
  const searchShown = searchOpen || searching;
  const view: SidebarPane = searching ? "files" : pane;
  const showEmpty =
    notes.length === 0 && (searching || folders.length === 0);
  const sortLabel = NOTE_SORTS.find((item) => item.id === sort)?.label ?? "标题";
  const sortShort =
    sort === "updated" ? "修改" : sort === "created" ? "创建" : sort === "opened" ? "打开" : "标题";
  const links = useMemo(() => noteLinks(notes, activeId), [notes, activeId]);
  const mentions = useMemo(
    () => (view === "links" ? unlinkedMentions(notes, activeId) : []),
    [view, notes, activeId],
  );
  const tagIndex = useMemo(() => libraryTags(notes), [notes]);
  const activeTagLabel = tagIndex.tags.find((tag) => tag.key === activeTag)?.label ?? null;
  const taggedNotes = activeTag
    ? notes.filter((note) => tagMatches(tagIndex.keysByNote.get(note.id) ?? [], activeTag))
    : null;

  useEffect(() => {
    setStars(readStars());
    setOpened(readOpened());
    const refreshStars = () => setStars(readStars());
    const refreshOpened = () => setOpened(readOpened());
    window.addEventListener("jingjian-stars", refreshStars);
    window.addEventListener("jingjian-opened", refreshOpened);
    return () => {
      window.removeEventListener("jingjian-stars", refreshStars);
      window.removeEventListener("jingjian-opened", refreshOpened);
    };
  }, []);

  useEffect(() => {
    function openSearch() {
      setSearchOpen(true);
      requestAnimationFrame(() => document.getElementById("note-search")?.focus());
    }
    window.addEventListener("jingjian-open-search", openSearch);
    return () => window.removeEventListener("jingjian-open-search", openSearch);
  }, []);

  useEffect(() => {
    if (!activeFolder) return;
    setExpanded((current) => {
      const paths = ancestorFolders(activeFolder);
      if (paths.every((path) => current.has(path))) return current;
      const next = new Set(current);
      for (const path of paths) next.add(path);
      writeOpenFolders(next);
      return next;
    });
  }, [activeFolder]);

  useEffect(() => {
    const note = notesRef.current.find((item) => item.id === activeId);
    if (!note?.folder) return;
    setExpanded((current) => {
      const paths = ancestorFolders(note.folder ?? "");
      if (paths.every((path) => current.has(path))) return current;
      const next = new Set(current);
      for (const path of paths) next.add(path);
      writeOpenFolders(next);
      return next;
    });
  }, [activeId]);

  useEffect(() => {
    if (view !== "files" || !activeId) return;
    const frame = requestAnimationFrame(() => {
      treeRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeId, view, expanded, openBooks, booksSectionOpen, tagsOpen, activeTag]);

  useEffect(() => {
    if (!activeTag) return;
    if (!tagIndex.tags.some((tag) => tag.key === activeTag)) setActiveTag(null);
  }, [activeTag, tagIndex]);

  function closeCreate() {
    setCreateOpen(false);
  }

  function toggleFolder(path: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      writeOpenFolders(next);
      return next;
    });
  }

  function toggleBook(bookId: string) {
    setOpenBooks((current) => {
      const next = toggleOpenId(current, bookId);
      writeOpenBooks(next);
      return next;
    });
  }

  function toggleSnippets() {
    setSnippets((current) => {
      const next = !current;
      writeFlag(SNIPPETS_KEY, next);
      return next;
    });
  }

  function choosePane(next: SidebarPane) {
    if (next !== "files") {
      if (query.trim()) onQueryChange("");
      setSearchOpen(false);
    }
    setPane(next);
    writePane(next);
  }

  function collapseAll() {
    const foldersClosed = new Set<string>();
    const booksClosed = new Set<string>();
    setExpanded(foldersClosed);
    writeOpenFolders(foldersClosed);
    setOpenBooks(booksClosed);
    writeOpenBooks(booksClosed);
    setTagsOpen(false);
    writeFlag(TAGS_SECTION_KEY, false);
    setActiveTag(null);
  }

  function openBook(bookId: string) {
    setOpenBooks((current) => {
      if (current.has(bookId)) return current;
      const next = new Set(current);
      next.add(bookId);
      writeOpenBooks(next);
      return next;
    });
  }

  function openLinked(id: string) {
    const note = notes.find((item) => item.id === id);
    if (note?.bookId) openBook(note.bookId);
    selectAndExpand(id);
  }

  function selectAndExpand(id: string) {
    const note = notes.find((item) => item.id === id);
    if (note?.folder) {
      setExpanded((current) => {
        const next = new Set(current);
        for (const path of ancestorFolders(note.folder ?? "")) next.add(path);
        writeOpenFolders(next);
        return next;
      });
    }
    onSelect(id);
  }

  return (
    <div className="app-sidebar-inner bg-surface text-fg">
      <div className="flex items-center gap-2 px-2.5 pt-3 pb-2">
        <img
          src="/favicon.svg"
          alt=""
          width={32}
          height={32}
          className="size-8 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-base leading-tight font-medium tracking-tight">
            静笺
          </div>
          <div className="text-[11px] leading-4 text-muted">{syncLabel}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="phone-only size-8"
          aria-label="关闭笔记列表"
          onClick={onCloseMobile}
        >
          <X />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label="仓库文章"
          onClick={onOpenBlog}
        >
          <Newspaper />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label="回收站"
          onClick={onOpenTrash}
        >
          <Trash2 />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="size-8"
          aria-label="设置"
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
        <div className="relative" ref={createBtnRef}>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-8"
            aria-label="新建或导入"
            aria-expanded={createOpen}
            onClick={() => setCreateOpen((open) => !open)}
          >
            <Plus />
          </Button>
          <CreateMenu
            open={createOpen}
            anchor={createBtnRef.current}
            hasBook={hasBook}
            canMakeBook={canMakeBook}
            onOpenChange={setCreateOpen}
            onCreateMarkdown={() => {
              closeCreate();
              onCreate();
            }}
            onCreateText={() => {
              closeCreate();
              onCreateText();
            }}
            onCreateFolder={() => {
              closeCreate();
              onCreateFolder();
            }}
            onCreateFromTemplate={(id) => {
              closeCreate();
              onCreateFromTemplate(id);
            }}
            onImportMarkdown={() => {
              closeCreate();
              onImportMarkdown();
            }}
            onImportTxt={() => {
              closeCreate();
              onImportTxt();
            }}
            onImportFolder={() => {
              closeCreate();
              onImportFolder();
            }}
            onImportEpub={() => {
              closeCreate();
              onImportEpub();
            }}
            onMakeBook={() => {
              closeCreate();
              onMakeBook();
            }}
            onAddChapter={() => {
              closeCreate();
              if (active?.bookId) openBook(active.bookId);
              onAddChapter();
            }}
          />
        </div>
      </div>

      <div className="px-2 pb-1.5">
        {searchShown ? (
          <label className="relative mb-1 block">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-subtle" />
            <Input
              id="note-search"
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="搜索笔记"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                event.stopPropagation();
                onQueryChange("");
                setSearchOpen(false);
              }}
              onBlur={() => {
                if (!query.trim()) setSearchOpen(false);
              }}
              className="h-9 pl-8 text-sm md:text-sm"
              aria-label="搜索笔记"
            />
          </label>
        ) : null}
        <div className="flex items-center gap-1 overflow-x-auto">
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("size-8 shrink-0", searchShown && "bg-overlay")}
            aria-label={searchShown ? "关闭搜索" : "搜索笔记"}
            aria-expanded={searchShown}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              if (searchShown) {
                onQueryChange("");
                setSearchOpen(false);
                return;
              }
              setSearchOpen(true);
              requestAnimationFrame(() => document.getElementById("note-search")?.focus());
            }}
          >
            <Search />
          </Button>
          <div role="tablist" aria-label="侧栏视图" className="flex h-8 min-w-0 flex-1 rounded-md bg-overlay p-0.5">
            <button
              type="button"
              role="tab"
              aria-selected={view === "files"}
              className={cn(
                "btn-press h-7 min-w-0 flex-1 rounded-sm px-1 text-xs",
                view === "files" ? "bg-paper text-fg shadow-border" : "text-muted",
              )}
              onClick={() => choosePane("files")}
            >
              目录
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "outline"}
              className={cn(
                "btn-press h-7 min-w-0 flex-1 rounded-sm px-1 text-xs",
                view === "outline" ? "bg-paper text-fg shadow-border" : "text-muted",
              )}
              onClick={() => choosePane("outline")}
            >
              大纲
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "links"}
              className={cn(
                "btn-press h-7 min-w-0 flex-1 rounded-sm px-1 text-xs",
                view === "links" ? "bg-paper text-fg shadow-border" : "text-muted",
              )}
              onClick={() => choosePane("links")}
            >
              链接
            </button>
          </div>
          {view === "files" && !showEmpty ? (
            <Button
              variant="ghost"
              size="icon-sm"
              className="size-8"
              aria-label="全部折叠"
              onClick={collapseAll}
            >
              <ChevronsDownUp />
            </Button>
          ) : null}
          {view === "files" ? (
          <button
            type="button"
            className={cn(
              "btn-press h-8 shrink-0 rounded-md px-2 text-xs",
              snippets ? "bg-overlay text-fg" : "text-muted hover:bg-overlay",
            )}
            aria-pressed={snippets}
            aria-label={snippets ? "隐藏笔记摘要" : "显示笔记摘要"}
            onClick={toggleSnippets}
          >
            摘要
          </button>
          ) : null}
          {view === "files" && onOpenToday ? (
          <button
            type="button"
            className="btn-press h-8 shrink-0 rounded-md px-1.5 text-xs text-muted hover:bg-overlay"
            onClick={onOpenToday}
          >
            今天
          </button>
          ) : null}
          {view === "files" ? (
          <button
            type="button"
            className="btn-press h-8 shrink-0 rounded-md px-1.5 text-xs text-muted hover:bg-overlay"
            aria-label={`排序：${sortLabel}`}
            onClick={() => {
              const index = NOTE_SORTS.findIndex((item) => item.id === sort);
              onSortChange(NOTE_SORTS[(index + 1) % NOTE_SORTS.length].id);
            }}
          >
            {sortShort}
          </button>
          ) : null}
        </div>
      </div>

      {view === "outline" ? (
        headings.length > 0 ? (
          <OutlineList headings={headings} activeId={activeHeadingId} onJump={onJumpHeading} />
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center px-4 text-center">
            <p className="text-xs leading-5 text-muted">
              这篇没有标题。写一行以 # 开头的标题后，会出现在这里。
            </p>
          </div>
        )
      ) : view === "links" ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-2" aria-label="链接">
          <button
            type="button"
            className="btn-press mx-1 mt-1 mb-2 flex h-8 w-[calc(100%-0.5rem)] items-center justify-center rounded-md bg-overlay text-xs text-fg"
            onClick={onOpenGraph}
          >
            关系图
          </button>
          {!activeId ? (
            <p className="px-3 py-8 text-center text-xs text-muted">先打开一篇笔记</p>
          ) : (
            <>
              <div className="px-2 pt-1 pb-1 text-[11px] font-medium tracking-wide text-subtle">
                提到本文
                <span className="ml-1 tabular-nums">{links.incoming.length}</span>
              </div>
              {links.incoming.length === 0 ? (
                <p className="px-2 pb-2 text-xs leading-5 text-muted">还没有笔记用双链指向这篇。</p>
              ) : (
                <ul>
                  {links.incoming.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="note-item btn-press flex w-full flex-col items-start rounded-md px-2 py-1 text-left hover:bg-overlay"
                        onClick={() => openLinked(item.id)}
                      >
                        <span className="w-full truncate text-sm text-fg">
                          {item.title}
                          {item.count > 1 ? <span className="ml-1 text-xs text-subtle">×{item.count}</span> : null}
                        </span>
                        {item.line ? (
                          <span className="w-full truncate text-[11px] leading-4 text-muted">{item.line}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-subtle">
                本文提到
                <span className="ml-1 tabular-nums">{links.outgoing.length}</span>
              </div>
              {links.outgoing.length === 0 ? (
                <p className="px-2 text-xs leading-5 text-muted">这篇没有 [[笔记名]] 双链。</p>
              ) : (
                <ul>
                  {links.outgoing.map((item) => (
                    <li key={item.target}>
                      {item.id ? (
                        <button
                          type="button"
                          className="note-item btn-press flex w-full flex-col items-start rounded-md px-2 py-1 text-left hover:bg-overlay"
                          onClick={() => openLinked(item.id!)}
                        >
                          <span className="w-full truncate text-sm text-fg">{item.target}</span>
                          {item.line ? (
                            <span className="w-full truncate text-[11px] leading-4 text-muted">{item.line}</span>
                          ) : null}
                        </button>
                      ) : (
                        <div className="px-2 py-1">
                          <span className="block truncate text-sm text-muted">{item.target}</span>
                          <span className="text-[11px] text-subtle">还没有这篇</span>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <div className="px-2 pt-3 pb-1 text-[11px] font-medium tracking-wide text-subtle">
                未写成双链
                <span className="ml-1 tabular-nums">{mentions.length}</span>
              </div>
              {mentions.length === 0 ? (
                <p className="px-2 text-xs leading-5 text-muted">正文里直接写了别的笔记标题时，会出现在这里。</p>
              ) : (
                <ul>
                  {mentions.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="note-item btn-press flex w-full flex-col items-start rounded-md px-2 py-1 text-left hover:bg-overlay"
                        onClick={() => openLinked(item.id)}
                      >
                        <span className="w-full truncate text-sm text-fg">
                          {item.title}
                          {item.count > 1 ? <span className="ml-1 text-xs text-subtle">×{item.count}</span> : null}
                        </span>
                        {item.line ? (
                          <span className="w-full truncate text-[11px] leading-4 text-muted">{item.line}</span>
                        ) : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      ) : (
      <nav
        ref={treeRef}
        data-tree-root=""
        className="min-h-0 flex-1 overflow-y-auto px-1 pb-1"
        aria-label="笔记列表"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("text/jingjian-note")) event.preventDefault();
        }}
        onDrop={(event) => {
          const id = event.dataTransfer.getData("text/jingjian-note");
          if (!id) return;
          const target = event.target as HTMLElement;
          if (target.closest("[data-folder-drop]")) return;
          event.preventDefault();
          onMoveNote(id, null);
        }}
      >
        {showEmpty ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-muted">
              {query.trim() ? "没有找到匹配的笔记" : "还没有笔记"}
            </p>
            {!query.trim() ? (
              <Button variant="subtle" className="mt-4" onClick={onCreate}>
                新建笔记
              </Button>
            ) : null}
          </div>
        ) : (
          <>
            {!searching ? (
              <div className="mb-1">
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-1 px-1 text-left text-[11px] font-medium tracking-wide text-subtle"
                  aria-expanded={tagsOpen}
                  aria-label={tagsOpen ? "折叠标签" : "展开标签"}
                  onClick={() => {
                    setTagsOpen((current) => {
                      const next = !current;
                      writeFlag(TAGS_SECTION_KEY, next);
                      return next;
                    });
                  }}
                >
                  <ChevronRight
                    className={cn("size-3.5 shrink-0 transition-transform", tagsOpen && "rotate-90")}
                  />
                  <span>标签</span>
                  {activeTagLabel ? (
                    <span className="min-w-0 truncate font-normal text-fg">#{activeTagLabel.split("/").pop()}</span>
                  ) : null}
                  <span className="ml-auto tabular-nums">{tagIndex.tags.length}</span>
                </button>
                {tagsOpen ? (
                  tagIndex.tags.length === 0 ? (
                    <p className="px-2 pb-2 text-xs leading-5 text-muted">
                      正文写 #标签，井号后面紧挨文字，不要空格。点一下只显示相关笔记，再点一次恢复。
                    </p>
                  ) : (
                    <ul aria-label="标签">
                      {tagIndex.tags.slice(0, 80).map((tag) => {
                        const selected = tag.key === activeTag;
                        const depth = tag.key.split("/").length - 1;
                        return (
                          <li key={tag.key}>
                            <button
                              type="button"
                              aria-pressed={selected}
                              title={`#${tag.label}`}
                              onClick={() => setActiveTag((current) => (current === tag.key ? null : tag.key))}
                              className={cn(
                                "note-item btn-press flex w-full items-center gap-1 rounded-md py-1 pr-2 text-left text-sm",
                                selected ? "bg-paper shadow-border" : "hover:bg-overlay",
                              )}
                              style={{ paddingLeft: 8 + depth * 12 }}
                            >
                              <span className="min-w-0 flex-1 truncate text-fg">
                                #{tag.label.split("/").pop()}
                              </span>
                              <span className="shrink-0 tabular-nums text-xs text-subtle">{tag.count}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )
                ) : null}
              </div>
            ) : null}
            {taggedNotes && !searching ? (
              taggedNotes.length === 0 ? (
                <p className="px-3 py-6 text-center text-xs text-muted">没有笔记带着这个标签</p>
              ) : (
                <ul role="listbox" aria-label="标签笔记">
                  {taggedNotes.map((note) => {
                    const selected = note.id === activeId;
                    return (
                      <li key={note.id} role="none">
                        <button
                          type="button"
                          role="option"
                          aria-selected={selected}
                          onClick={() => openLinked(note.id)}
                          className={cn(
                            "note-item btn-press flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left",
                            selected ? "bg-paper shadow-border" : "hover:bg-overlay",
                          )}
                        >
                          <span className="w-full truncate font-medium text-fg">
                            {titleFromContent(note.content)}
                          </span>
                          {note.bookTitle || note.folder ? (
                            <span className="mt-0.5 w-full truncate text-xs text-muted">
                              {note.bookTitle || note.folder}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : (
            <>
            {books.length > 0 ? (
              <div className="mb-1">
                <button
                  type="button"
                  className="flex h-7 w-full items-center gap-1 px-1 text-left text-[11px] font-medium tracking-wide text-subtle"
                  aria-expanded={booksSectionOpen}
                  aria-label={booksSectionOpen ? "折叠书" : "展开书"}
                  onClick={() => {
                    setBooksSectionOpen((current) => {
                      const next = !current;
                      writeFlag(BOOKS_SECTION_KEY, next);
                      return next;
                    });
                  }}
                >
                  <ChevronRight
                    className={cn("size-3.5 shrink-0 transition-transform", booksSectionOpen && "rotate-90")}
                  />
                  <span>书</span>
                  <span className="ml-auto tabular-nums">{books.length}</span>
                </button>
                {booksSectionOpen ? books.map((group) => {
                  const bookId = group.bookId;
                  if (!bookId) return null;
                  const progress = chapterProgress(group.notes);
                  const resume = lastReadChapter(group.notes) ?? group.notes[0];
                  const open = openBooks.has(bookId);
                  const bookActive = group.notes.some((note) => note.id === activeId);
                  return (
                    <div key={bookId} className="mb-px">
                      <div
                        className={cn(
                          "note-item flex w-full items-center gap-0 rounded-md py-0 pr-1 text-left",
                          bookActive ? "bg-overlay" : "hover:bg-overlay",
                        )}
                      >
                        <button
                          type="button"
                          className="inline-flex size-7 shrink-0 items-center justify-center rounded-sm text-subtle hover:text-fg"
                          aria-label={open ? `折叠 ${group.label}` : `展开 ${group.label}`}
                          aria-expanded={open}
                          onClick={() => toggleBook(bookId)}
                        >
                          <ChevronRight
                            className={cn("size-3.5 transition-transform", open && "rotate-90")}
                          />
                        </button>
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-1.5 py-1"
                          onClick={() => toggleBook(bookId)}
                        >
                          <BookOpen className="size-3.5 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                            {group.label}
                          </span>
                          <span className="shrink-0 tabular-nums text-xs text-subtle">
                            {progress.current}/{progress.total}
                          </span>
                        </button>
                        {onReadBook && resume ? (
                          <button
                            type="button"
                            className="btn-press shrink-0 rounded-sm px-1.5 py-1 text-xs text-muted hover:text-fg"
                            onClick={() => onReadBook(resume.id)}
                          >
                            阅读
                          </button>
                        ) : null}
                      </div>
                      {open ? (
                        <ul role="listbox" aria-label={group.label}>
                          {group.notes.map((note, index) => {
                            const selected = note.id === activeId;
                            return (
                              <li key={note.id} role="none">
                                <button
                                  type="button"
                                  role="option"
                                  aria-selected={selected}
                                  onClick={() => selectAndExpand(note.id)}
                                  className={cn(
                                    "note-item btn-press flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-sm",
                                    "transition-colors duration-(--motion-quick) ease-(--ease-out)",
                                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                                    selected ? "bg-paper shadow-border" : "hover:bg-overlay",
                                  )}
                                  style={{ paddingLeft: 18 }}
                                >
                                  <span className="w-4 shrink-0 text-xs tabular-nums text-subtle">
                                    {index + 1}
                                  </span>
                                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">
                                    {titleFromContent(note.content)}
                                  </span>
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                }) : null}
              </div>
            ) : null}

            {searching ? (
              <ul role="listbox" aria-label="搜索结果">
                {treeNotes.map((note) => {
                  const selected = note.id === activeId;
                  return (
                    <li key={note.id} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => selectAndExpand(note.id)}
                        className={cn(
                          "note-item btn-press flex w-full flex-col items-start rounded-md px-2 py-1.5 text-left",
                          selected ? "bg-paper shadow-border" : "hover:bg-overlay",
                        )}
                      >
                        <span className="truncate font-medium text-fg">
                          {titleFromContent(note.content)}
                        </span>
                        <span className="mt-0.5 w-full truncate text-xs text-muted">
                          {note.folder || formatRelativeTime(note.updatedAt, now)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <div>
                <FileTree
                  nodes={tree}
                  activeId={activeId}
                  activeFolder={activeFolder}
                  expanded={expanded}
                  showSnippets={snippets}
                  onSelect={selectAndExpand}
                  onToggle={toggleFolder}
                  onSelectFolder={onSelectFolder}
                  onCreateInFolder={onCreateInFolder}
                  onMoveNote={onMoveNote}
                  onNoteMenu={onNoteMenu}
                  onFolderMenu={onFolderMenu}
                  starred={stars}
                  onToggleStar={(id) => {
                    toggleStar(id);
                    setStars(readStars());
                  }}
                />
              </div>
            )}
            </>
            )}
          </>
        )}
      </nav>
      )}
    </div>
  );
}
