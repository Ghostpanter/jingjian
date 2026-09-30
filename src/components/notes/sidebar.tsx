import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronRight, Newspaper, Plus, Search, Settings, Trash2, X } from "lucide-react";
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
  snippetFromContent,
  titleFromContent,
  toggleOpenId,
  type NoteSort,
} from "@/lib/notes/format";
import type { OutlineHeading } from "@/lib/notes/outline";
import { chapterProgress, lastReadChapter } from "@/lib/notes/reader-progress";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const OPEN_KEY = "jingjian.folders.open.v1";
const BOOKS_OPEN_KEY = "jingjian.books.open.v1";
const OUTLINE_KEY = "jingjian.outline.height.v1";
const OUTLINE_OPEN_KEY = "jingjian.outline.open.v1";
const SNIPPETS_KEY = "jingjian.sidebar.snippets.v1";
const OUTLINE_MIN = 72;
const OUTLINE_MAX = 280;

function readOutlineHeight(): number {
  try {
    const raw = Number(localStorage.getItem(OUTLINE_KEY));
    if (Number.isFinite(raw) && raw >= OUTLINE_MIN && raw <= OUTLINE_MAX) return raw;
  } catch {
    // private mode
  }
  return 160;
}

function writeOutlineHeight(value: number) {
  try {
    localStorage.setItem(OUTLINE_KEY, String(value));
  } catch {
    // private mode
  }
}

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
  sort: NoteSort;
  onSortChange: (sort: NoteSort) => void;
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
  sort,
  onSortChange,
  onReadBook,
  syncLabel,
}: SidebarProps) {
  const groups = groupNotes(notes);
  const books = groups.filter((group) => group.book);
  const treeNotes = notes.filter((note) => !note.bookId);
  const tree = useMemo(
    () => buildFileTree(treeNotes, folders, sort),
    [treeNotes, folders, sort],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(readOpenFolders);
  const [openBooks, setOpenBooks] = useState<Set<string>>(readOpenBooks);
  const [outlineHeight, setOutlineHeight] = useState(readOutlineHeight);
  const [outlineOpen, setOutlineOpen] = useState(() => readFlag(OUTLINE_OPEN_KEY, false));
  const [snippets, setSnippets] = useState(() => readFlag(SNIPPETS_KEY, false));
  const createBtnRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<{ startY: number; startH: number } | null>(null);
  const active = notes.find((note) => note.id === activeId);
  const hasBook = Boolean(active?.bookId);
  const canMakeBook = Boolean(active) && !active?.bookId;
  const searching = Boolean(query.trim());
  const showEmpty =
    notes.length === 0 && (searching || folders.length === 0);
  const sortLabel = NOTE_SORTS.find((item) => item.id === sort)?.label ?? "标题";
  const activeHeading = headings.find((heading) => heading.id === activeHeadingId);

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

  function toggleOutline() {
    setOutlineOpen((current) => {
      const next = !current;
      writeFlag(OUTLINE_OPEN_KEY, next);
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

  function openBook(bookId: string) {
    setOpenBooks((current) => {
      if (current.has(bookId)) return current;
      const next = new Set(current);
      next.add(bookId);
      writeOpenBooks(next);
      return next;
    });
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
        <label className="relative block">
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
            className="h-9 pl-8 text-sm md:text-sm"
            aria-label="搜索笔记"
          />
        </label>
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            className="btn-press h-8 min-w-0 flex-1 truncate rounded-md bg-overlay px-2 text-left text-xs text-muted"
            aria-label={`排序：${sortLabel}`}
            onClick={() => {
              const index = NOTE_SORTS.findIndex((item) => item.id === sort);
              onSortChange(NOTE_SORTS[(index + 1) % NOTE_SORTS.length].id);
            }}
          >
            {`排序·${sortLabel}`}
          </button>
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
          <Button variant="ghost" size="icon-sm" className="size-8" aria-label="仓库文章" onClick={onOpenBlog}>
            <Newspaper />
          </Button>
          <Button variant="ghost" size="icon-sm" className="size-8" aria-label="回收站" onClick={onOpenTrash}>
            <Trash2 />
          </Button>
        </div>
      </div>

      <nav
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
            {books.length > 0 ? (
              <div className="mb-1">
                <div className="px-2 py-1 text-[11px] font-medium tracking-wide text-subtle">
                  书
                </div>
                {books.map((group) => {
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
                })}
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
                />
              </div>
            )}
          </>
        )}
      </nav>
      {headings.length > 0 ? (
        <div className="outline-panel shrink-0">
          <button
            type="button"
            className="flex h-8 w-full items-center gap-1 px-2 text-left text-[11px] text-subtle"
            aria-expanded={outlineOpen}
            aria-label={outlineOpen ? "收起大纲" : "展开大纲"}
            onClick={toggleOutline}
          >
            <ChevronRight
              className={cn("size-3.5 shrink-0 transition-transform", outlineOpen && "rotate-90")}
            />
            <span className="shrink-0 font-medium tracking-wide">大纲</span>
            {outlineOpen ? (
              <span className="ml-auto tabular-nums">{headings.length}</span>
            ) : (
              <span className="ml-auto min-w-0 truncate text-muted">
                {activeHeading?.text ?? headings.length}
              </span>
            )}
          </button>
          {outlineOpen ? (
            <>
              <div
                role="separator"
                aria-orientation="horizontal"
                aria-label="调整大纲高度"
                className="outline-split"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  splitRef.current = { startY: event.clientY, startH: outlineHeight };
                }}
                onPointerMove={(event) => {
                  if (!splitRef.current) return;
                  const next = Math.min(
                    OUTLINE_MAX,
                    Math.max(OUTLINE_MIN, splitRef.current.startH + (splitRef.current.startY - event.clientY)),
                  );
                  setOutlineHeight(next);
                }}
                onPointerUp={() => {
                  splitRef.current = null;
                  writeOutlineHeight(outlineHeight);
                }}
                onPointerCancel={() => {
                  splitRef.current = null;
                }}
              />
              <OutlineList
                headings={headings}
                activeId={activeHeadingId}
                height={outlineHeight}
                onJump={onJumpHeading}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
