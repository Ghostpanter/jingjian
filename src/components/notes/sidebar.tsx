import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Plus, Search, Settings, X } from "lucide-react";
import { CreateMenu } from "@/components/notes/create-menu";
import { FileTree } from "@/components/notes/file-tree";
import { OutlineList } from "@/components/notes/outline-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ancestorFolders, buildFileTree } from "@/lib/notes/folder-tree";
import {
  formatRelativeTime,
  groupNotes,
  snippetFromContent,
  titleFromContent,
} from "@/lib/notes/format";
import type { OutlineHeading } from "@/lib/notes/outline";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const OPEN_KEY = "jingjian.folders.open.v1";
const OUTLINE_KEY = "jingjian.outline.height.v1";
const OUTLINE_MIN = 88;
const OUTLINE_MAX = 360;

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
  onReadBook,
  syncLabel,
}: SidebarProps) {
  const groups = groupNotes(notes);
  const books = groups.filter((group) => group.book);
  const treeNotes = notes.filter((note) => !note.bookId);
  const tree = useMemo(
    () => buildFileTree(treeNotes, folders),
    [treeNotes, folders],
  );
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(readOpenFolders);
  const [outlineHeight, setOutlineHeight] = useState(readOutlineHeight);
  const createBtnRef = useRef<HTMLDivElement>(null);
  const splitRef = useRef<{ startY: number; startH: number } | null>(null);
  const active = notes.find((note) => note.id === activeId);
  const hasBook = Boolean(active?.bookId);
  const canMakeBook = Boolean(active) && !active?.bookId;
  const searching = Boolean(query.trim());
  const showEmpty =
    notes.length === 0 && (searching || folders.length === 0);

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
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <img
          src="/favicon.svg"
          alt=""
          width={36}
          height={36}
          className="size-9 shrink-0 rounded-md"
        />
        <div className="min-w-0 flex-1">
          <div className="font-serif text-lg leading-tight font-medium tracking-tight">
            静笺
          </div>
          <div className="text-xs text-muted">{syncLabel}</div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="phone-only"
          aria-label="关闭笔记列表"
          onClick={onCloseMobile}
        >
          <X />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="设置"
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
        <div className="relative" ref={createBtnRef}>
          <Button
            variant="ghost"
            size="icon-sm"
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
              onAddChapter();
            }}
          />
        </div>
      </div>

      <div className="px-3 pb-3">
        <label className="relative block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
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
            className="h-11 pl-9 text-sm md:text-sm"
            aria-label="搜索笔记"
          />
        </label>
      </div>

      <nav
        data-tree-root=""
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-2"
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
            {books.map((group) => (
              <div key={group.label} className="mb-3">
                <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium tracking-wide text-subtle">
                  <BookOpen className="size-3.5" />
                  <span className="min-w-0 flex-1 truncate">{group.label}</span>
                  {onReadBook && group.notes[0] ? (
                    <button
                      type="button"
                      className="btn-press rounded-sm px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
                      onClick={() => onReadBook(group.notes[0].id)}
                    >
                      阅读
                    </button>
                  ) : null}
                </div>
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
                            "note-item btn-press flex w-full flex-col items-start rounded-lg px-3 py-3 text-left",
                            "transition-colors duration-(--motion-quick) ease-(--ease-out)",
                            "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                            selected ? "bg-paper shadow-border" : "hover:bg-overlay",
                          )}
                        >
                          <span className="flex w-full items-baseline gap-2">
                            <span className="w-4 shrink-0 text-xs tabular-nums text-subtle">
                              {index + 1}
                            </span>
                            <span className="min-w-0 flex-1 truncate font-medium text-fg">
                              {titleFromContent(note.content)}
                            </span>
                          </span>
                          <span className="mt-0.5 line-clamp-1 w-full text-xs text-muted">
                            {snippetFromContent(note.content)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

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
                          "note-item btn-press flex w-full flex-col items-start rounded-lg px-3 py-3 text-left",
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
      ) : null}
      <OutlineList
        headings={headings}
        activeId={activeHeadingId}
        height={outlineHeight}
        onJump={onJumpHeading}
      />
    </div>
  );
}
