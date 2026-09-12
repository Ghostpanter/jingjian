import {
  Columns2,
  Keyboard,
  PanelLeft,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast, Toaster } from "sonner";
import { DeleteNoteDialog, ShortcutsDialog } from "@/components/notes/dialogs";
import { EditorPane } from "@/components/notes/editor-pane";
import { PreviewPane } from "@/components/notes/preview-pane";
import { Sidebar } from "@/components/notes/sidebar";
import { Button } from "@/components/ui/button";
import {
  countChars,
  formatRelativeTime,
  titleFromContent,
} from "@/lib/notes/format";
import {
  hydrateNotesStore,
  useActiveNote,
  useNotesStore,
  useSortedNotes,
} from "@/lib/notes/store";
import type { PreviewMode } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: { id: PreviewMode; label: string; icon: typeof Pencil }[] =
  [
    { id: "edit", label: "编辑", icon: Pencil },
    { id: "split", label: "分栏", icon: Columns2 },
    { id: "preview", label: "预览", icon: Eye },
  ];

export function NoteApp() {
  const hydrated = useNotesStore((state) => state.hydrated);
  const query = useNotesStore((state) => state.query);
  const previewMode = useNotesStore((state) => state.previewMode);
  const sidebarOpen = useNotesStore((state) => state.sidebarOpen);
  const createNote = useNotesStore((state) => state.createNote);
  const deleteNote = useNotesStore((state) => state.deleteNote);
  const updateNote = useNotesStore((state) => state.updateNote);
  const selectNote = useNotesStore((state) => state.selectNote);
  const setQuery = useNotesStore((state) => state.setQuery);
  const setPreviewMode = useNotesStore((state) => state.setPreviewMode);
  const cyclePreviewMode = useNotesStore((state) => state.cyclePreviewMode);
  const toggleSidebar = useNotesStore((state) => state.toggleSidebar);
  const setSidebarOpen = useNotesStore((state) => state.setSidebarOpen);

  const notes = useSortedNotes();
  const activeNote = useActiveNote();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [modLabel, setModLabel] = useState("Ctrl");
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  useEffect(() => {
    hydrateNotesStore();
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const apple = /Mac|iPhone|iPad/i.test(navigator.userAgent);
    setModLabel(apple ? "⌘" : "Ctrl");
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const typing =
        target instanceof HTMLElement &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable);
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;

      if (key === "Escape") {
        setShortcutsOpen(false);
        setPendingDelete(false);
        setSidebarOpen(false);
        if (typing) target.blur();
        return;
      }

      if (!typing && (key === "?" || (key === "/" && event.shiftKey))) {
        event.preventDefault();
        setShortcutsOpen((open) => !open);
        return;
      }

      if (!typing && key === "/" && !mod) {
        event.preventDefault();
        document.getElementById("note-search")?.focus();
        return;
      }

      if (mod && key.toLowerCase() === "n") {
        event.preventDefault();
        const id = createNote();
        window.setTimeout(() => document.getElementById("note-editor")?.focus(), 0);
        toast.message("已新建笔记");
        void id;
        return;
      }

      if (mod && key.toLowerCase() === "f") {
        event.preventDefault();
        setSidebarOpen(true);
        setDesktopCollapsed(false);
        window.setTimeout(
          () => document.getElementById("note-search")?.focus(),
          0,
        );
        return;
      }

      if (mod && key.toLowerCase() === "e") {
        event.preventDefault();
        cyclePreviewMode();
        return;
      }

      if (mod && key.toLowerCase() === "b") {
        event.preventDefault();
        if (window.matchMedia("(min-width: 768px)").matches) {
          setDesktopCollapsed((value) => !value);
        } else {
          toggleSidebar();
        }
        return;
      }

      if (mod && key.toLowerCase() === "s") {
        event.preventDefault();
        toast.message("已保存到本机");
        return;
      }

      if (mod && event.shiftKey && (key === "Backspace" || key === "Delete")) {
        event.preventDefault();
        if (activeNote) setPendingDelete(true);
        return;
      }

      if (shortcutsOpen || pendingDelete) return;

      const move =
        (!typing && (key === "j" || key === "ArrowDown")) ||
        (typing && target?.id === "note-search" && key === "ArrowDown") ||
        (mod && key === "ArrowDown");
      const moveUp =
        (!typing && (key === "k" || key === "ArrowUp")) ||
        (typing && target?.id === "note-search" && key === "ArrowUp") ||
        (mod && key === "ArrowUp");

      if (move || moveUp) {
        if (notes.length === 0) return;
        event.preventDefault();
        const currentIndex = notes.findIndex(
          (note) => note.id === activeNote?.id,
        );
        const nextIndex = move
          ? Math.min(notes.length - 1, currentIndex + 1)
          : Math.max(0, currentIndex < 0 ? 0 : currentIndex - 1);
        const next = notes[nextIndex];
        if (next) selectNote(next.id);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeNote,
    createNote,
    cyclePreviewMode,
    notes,
    pendingDelete,
    selectNote,
    setSidebarOpen,
    shortcutsOpen,
    toggleSidebar,
  ]);

  const charCount = useMemo(
    () => countChars(activeNote?.content ?? ""),
    [activeNote?.content],
  );

  function handleCreate() {
    createNote();
    window.setTimeout(() => document.getElementById("note-editor")?.focus(), 0);
  }

  function handleDelete() {
    if (!activeNote) return;
    deleteNote(activeNote.id);
    setPendingDelete(false);
    toast.message("笔记已删除");
  }

  if (!hydrated) {
    return (
      <div className="flex h-dvh bg-bg">
        <div className="hidden w-72 border-r border-border bg-surface md:block" />
        <div className="flex-1 bg-bg" />
      </div>
    );
  }

  const showEditor = previewMode === "edit" || previewMode === "split";
  const showPreview = previewMode === "preview" || previewMode === "split";

  return (
    <div className="safe-shell relative flex h-dvh overflow-hidden bg-bg text-fg">
      <Toaster
        position="bottom-center"
        duration={1600}
        className="toaster"
        offset={24}
      />

      <aside
        className={cn(
          "flex w-full shrink-0 flex-col border-border bg-surface md:w-72 md:border-r",
          "max-md:fixed max-md:inset-0 max-md:z-40",
          "max-md:transition-transform max-md:duration-(--motion-slow) max-md:ease-(--ease-smooth-out)",
          sidebarOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full",
          desktopCollapsed && "md:hidden",
        )}
      >
        <Sidebar
          notes={notes}
          activeId={activeNote?.id ?? null}
          query={query}
          now={now}
          onQueryChange={setQuery}
          onSelect={selectNote}
          onCreate={handleCreate}
          onCloseMobile={() => setSidebarOpen(false)}
        />
      </aside>

      <section className="flex min-w-0 flex-1 flex-col bg-bg">
        <header className="flex items-center gap-2 border-b border-border px-3 py-2 sm:px-4">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="打开笔记列表"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            aria-label={desktopCollapsed ? "显示侧栏" : "收起侧栏"}
            onClick={() => setDesktopCollapsed((value) => !value)}
          >
            <PanelLeft />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">
              {activeNote ? titleFromContent(activeNote.content) : "静笺"}
            </div>
            <div className="truncate text-xs text-muted tabular-nums">
              {activeNote
                ? `最后编辑 ${formatRelativeTime(activeNote.updatedAt, now)}`
                : "本地保存，不上传"}
            </div>
          </div>

          <div
            className="flex rounded-lg bg-overlay p-1"
            role="radiogroup"
            aria-label="编辑与预览"
          >
            {VIEW_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = previewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={option.label}
                  onClick={() => setPreviewMode(option.id)}
                  className={cn(
                    "btn-press inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-sm",
                    "transition-colors duration-(--motion-quick) ease-(--ease-out)",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    selected
                      ? "bg-paper text-fg shadow-border"
                      : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-4" />
                  <span className="hidden sm:inline">{option.label}</span>
                </button>
              );
            })}
          </div>

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="键盘快捷键"
            onClick={() => setShortcutsOpen(true)}
            className="hidden sm:inline-flex"
          >
            <Keyboard />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="删除笔记"
            disabled={!activeNote}
            onClick={() => setPendingDelete(true)}
          >
            <Trash2 />
          </Button>
        </header>

        <div
          className={cn(
            "grid min-h-0 flex-1",
            previewMode === "split"
              ? "grid-rows-2 lg:grid-cols-2 lg:grid-rows-1"
              : "grid-cols-1",
          )}
        >
          {showEditor ? (
            <div
              className={cn(
                "min-h-0 min-w-0",
                previewMode === "split" && "border-border max-lg:border-b lg:border-r",
              )}
            >
              {activeNote ? (
                <EditorPane
                  noteId={activeNote.id}
                  content={activeNote.content}
                  centered={previewMode !== "split"}
                  onChange={(value) => updateNote(activeNote.id, value)}
                />
              ) : (
                <EmptyEditor onCreate={handleCreate} />
              )}
            </div>
          ) : null}

          {showPreview ? (
            <div className="min-h-0 min-w-0 bg-bg">
              {activeNote ? (
                <PreviewPane
                  content={activeNote.content}
                  centered={previewMode !== "split"}
                />
              ) : (
                <EmptyEditor onCreate={handleCreate} />
              )}
            </div>
          ) : null}
        </div>

        <footer className="flex items-center justify-between gap-3 border-t border-border px-4 py-2 text-xs text-muted">
          <span className="tabular-nums">{charCount} 字</span>
          <span className="hidden sm:inline">保存在本机浏览器</span>
          <span className="hidden sm:inline tabular-nums">
            {modLabel}+N 新建 · ? 快捷键
          </span>
        </footer>
      </section>

      <DeleteNoteDialog
        open={pendingDelete && Boolean(activeNote)}
        title={activeNote ? titleFromContent(activeNote.content) : ""}
        onOpenChange={setPendingDelete}
        onConfirm={handleDelete}
      />
      <ShortcutsDialog
        open={shortcutsOpen}
        onOpenChange={setShortcutsOpen}
        modLabel={modLabel}
      />
    </div>
  );
}

function EmptyEditor({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-xl text-fg">一张空白页</p>
      <p className="mt-2 max-w-xs text-sm leading-normal text-muted text-pretty">
        新建一篇笔记，第一行会成为标题。内容只留在这台设备上。
      </p>
      <Button className="mt-6" onClick={onCreate}>
        新建笔记
      </Button>
    </div>
  );
}
