import {
  Columns2,
  Keyboard,
  PanelLeft,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { DeleteNoteDialog, ShortcutsDialog } from "@/components/notes/dialogs";
import { EditorPane } from "@/components/notes/editor-pane";
import { PreviewPane } from "@/components/notes/preview-pane";
import { SettingsDialog } from "@/components/notes/settings-dialog";
import { Sidebar } from "@/components/notes/sidebar";
import { Button } from "@/components/ui/button";
import { countChars, titleFromContent } from "@/lib/notes/format";
import { recordTombstone, readSyncConfig, writeSyncConfig } from "@/lib/notes/sync-config";
import { runSync } from "@/lib/notes/sync";
import { DEFAULT_SYNC_CONFIG, type SyncConfig, type SyncStatus } from "@/lib/notes/sync-types";
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
    { id: "edit", label: "源码", icon: Pencil },
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
  const applySyncedNotes = useNotesStore((state) => state.applySyncedNotes);
  const editorEpoch = useNotesStore((state) => state.editorEpoch);
  const rawNotes = useNotesStore((state) => state.notes);

  const notes = useSortedNotes();
  const activeNote = useActiveNote();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: "idle",
    message: "仅本机",
    at: null,
  });
  const syncingRef = useRef(false);

  const syncNow = useCallback(async (silent = false) => {
    const config = readSyncConfig();
    if (config.provider === "off") {
      setSyncStatus({ state: "idle", message: "仅本机", at: null });
      return;
    }
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncStatus({ state: "syncing", message: "正在同步", at: Date.now() });
    try {
      const result = await runSync(config, useNotesStore.getState().notes);
      applySyncedNotes(result.notes);
      setSyncStatus(result.status);
      if (!silent) toast.message(result.status.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "同步失败";
      setSyncStatus({ state: "error", message, at: Date.now() });
      if (!silent) toast.message(message);
    } finally {
      syncingRef.current = false;
    }
  }, [applySyncedNotes]);

  useEffect(() => {
    hydrateNotesStore();
    setSyncConfig(readSyncConfig());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const config = readSyncConfig();
    if (config.provider !== "off" && config.autoSync) {
      void syncNow(true);
    }
  }, [hydrated, syncNow]);

  useEffect(() => {
    if (!hydrated) return;
    const config = readSyncConfig();
    if (config.provider === "off" || !config.autoSync) return;
    const timer = window.setTimeout(() => void syncNow(true), 2800);
    return () => window.clearTimeout(timer);
  }, [rawNotes, hydrated, syncNow]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      const config = readSyncConfig();
      if (config.provider !== "off" && config.autoSync) void syncNow(true);
    }, 90_000);
    return () => window.clearInterval(timer);
  }, [hydrated, syncNow]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
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
        setSettingsOpen(false);
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
        setSidebarOpen(true);
        setDesktopCollapsed(false);
        document.getElementById("note-search")?.focus();
        return;
      }

      if (mod && key.toLowerCase() === "n") {
        event.preventDefault();
        createNote();
        window.setTimeout(() => document.getElementById("note-editor")?.focus(), 0);
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

      if (mod && (key === "," || key === "，")) {
        event.preventDefault();
        setSettingsOpen((open) => !open);
        return;
      }

      if (mod && key.toLowerCase() === "s") {
        event.preventDefault();
        toast.message("已自动保存");
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
    recordTombstone(activeNote.id);
    deleteNote(activeNote.id);
    setPendingDelete(false);
    toast.message("笔记已删除");
  }

  if (!hydrated) {
    return <div className="app-shell safe-shell" />;
  }

  const showEditor = previewMode === "edit" || previewMode === "split";
  const showPreview = previewMode === "preview" || previewMode === "split";

  return (
    <div
      className={cn(
        "app-shell safe-shell",
        sidebarOpen && "is-files-open",
        desktopCollapsed && "is-sidebar-collapsed",
      )}
    >
      <Toaster
        position="bottom-center"
        duration={1600}
        className="toaster"
        offset={24}
      />

      <aside className="app-sidebar" aria-label="笔记列表">
        <Sidebar
          notes={notes}
          activeId={activeNote?.id ?? null}
          query={query}
          now={now}
          onQueryChange={setQuery}
          onSelect={selectNote}
          onCreate={handleCreate}
          onCloseMobile={() => setSidebarOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          syncLabel={
            syncConfig.provider === "off"
              ? "本地笔记"
              : syncStatus.state === "syncing"
                ? "正在同步"
                : syncStatus.state === "error"
                  ? "同步失败"
                  : "已启用同步"
          }
        />
      </aside>

      <section className="app-main">
        <header className="app-toolbar">
          <Button
            variant="ghost"
            size="icon-sm"
            className="md:hidden"
            aria-label="笔记列表"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden md:inline-flex"
            aria-label={desktopCollapsed ? "显示文件列表" : "收起文件列表"}
            onClick={() => setDesktopCollapsed((value) => !value)}
          >
            <PanelLeft />
          </Button>

          <div className="app-toolbar-spacer" />

          <div className="app-modes" role="radiogroup" aria-label="视图">
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
                    "btn-press inline-flex size-9 items-center justify-center rounded-sm",
                    "transition-colors duration-(--motion-quick) ease-(--ease-out)",
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                    selected
                      ? "bg-paper text-fg shadow-border"
                      : "text-muted hover:text-fg",
                  )}
                >
                  <Icon className="size-4" />
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
            "app-workspace",
            previewMode === "split" && "is-split",
          )}
        >
          {showEditor ? (
            <div className="app-pane">
              {activeNote ? (
                <EditorPane
                  noteId={activeNote.id}
                  epoch={editorEpoch}
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
            <div className="app-pane">
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

        <footer className="app-status">
          <span className="tabular-nums">{charCount} 字</span>
          <span>{syncConfig.provider === "off" ? "已自动保存" : syncStatus.message}</span>
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
      />
      <SettingsDialog
        open={settingsOpen}
        config={syncConfig}
        onOpenChange={setSettingsOpen}
        onSave={(next) => {
          writeSyncConfig(next);
          setSyncConfig(next);
        }}
        onSyncNow={() => void syncNow(false)}
      />
    </div>
  );
}

function EmptyEditor({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center">
      <p className="font-serif text-xl text-fg">一张空白页</p>
      <p className="mt-2 max-w-xs text-sm leading-normal text-muted text-pretty">
        从左侧点一篇笔记，或新建一页。第一行会成为标题，输入即保存。
      </p>
      <Button className="mt-6" onClick={onCreate}>
        新建笔记
      </Button>
    </div>
  );
}
