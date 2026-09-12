import {
  BookOpen,
  Columns2,
  FileDown,
  ImagePlus,
  Keyboard,
  Link2,
  PanelLeft,
  Pencil,
  Trash2,
  Eye,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import { DeleteNoteDialog, ShortcutsDialog } from "@/components/notes/dialogs";
import { EditorPane } from "@/components/notes/editor-pane";
import { ExportMenu } from "@/components/notes/export-menu";
import { LinkDialog, type LinkDraft } from "@/components/notes/link-dialog";
import { PreviewPane } from "@/components/notes/preview-pane";
import { ReaderView } from "@/components/notes/reader-view";
import { SettingsDialog } from "@/components/notes/settings-dialog";
import { Sidebar } from "@/components/notes/sidebar";
import { Button } from "@/components/ui/button";
import { exportNotes, type ExportFormat } from "@/lib/notes/export";
import { isCancelled } from "@/lib/notes/export-save";
import { notesFromEpub, parseEpub } from "@/lib/notes/epub";
import { countChars, titleFromContent } from "@/lib/notes/format";
import {
  indentLines,
  insertTable,
  looksLikeUrl,
  normalizeHref,
  readEditorSelection,
  setHeading,
  toggleOrderedList,
  toggleQuote,
  toggleTaskList,
  toggleUnorderedList,
  wrapAsMarkup,
  wrapFence,
  wrapInline,
  writeEditorValue,
  type MarkupEdit,
} from "@/lib/notes/insert-markup";
import { insertImageAtCursor, resolveInsertedImage } from "@/lib/notes/image-insert";
import { putImage, extensionFor } from "@/lib/notes/image-store";
import { recordTombstone, readSyncConfig, writeSyncConfig } from "@/lib/notes/sync-config";
import { runSync } from "@/lib/notes/sync";
import { applyTheme, readThemeConfig } from "@/lib/notes/theme";
import { DEFAULT_SYNC_CONFIG, type SyncConfig, type SyncStatus } from "@/lib/notes/sync-types";
import {
  hydrateNotesStore,
  useActiveNote,
  useNotesStore,
  useSortedNotes,
} from "@/lib/notes/store";
import { parseNoteFile } from "@/lib/notes/markdown-file";
import type { Note, PreviewMode } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const VIEW_OPTIONS: { id: PreviewMode; label: string; icon: typeof Pencil }[] =
  [
    { id: "edit", label: "源码", icon: Pencil },
    { id: "split", label: "分栏", icon: Columns2 },
    { id: "preview", label: "预览", icon: Eye },
  ];

function applyFormatHotkey(
  event: KeyboardEvent,
  apply: (mutator: (value: string, start: number, end: number) => MarkupEdit) => boolean,
): boolean {
  const mod = event.metaKey || event.ctrlKey;
  const key = event.key;
  const code = event.code;
  const shift = event.shiftKey;
  const run = (
    mutator: (value: string, start: number, end: number) => MarkupEdit,
  ) => {
    event.preventDefault();
    return apply(mutator);
  };

  if (event.altKey && shift && (key === "5" || key === "%")) {
    return run((value, start, end) => wrapInline(value, start, end, "~~"));
  }
  if (!mod) return false;

  if (shift && (key === "5" || key === "%")) {
    return run((value, start, end) => wrapInline(value, start, end, "~~"));
  }
  if (shift && (key === "]" || key === "}" || code === "BracketRight")) {
    return run((value, start, end) => toggleUnorderedList(value, start, end));
  }
  if (shift && (key === "[" || key === "{" || code === "BracketLeft")) {
    return run((value, start, end) => toggleOrderedList(value, start, end));
  }
  if (shift && key.toLowerCase() === "q") {
    return run((value, start, end) => toggleQuote(value, start, end));
  }
  if (shift && key.toLowerCase() === "x") {
    return run((value, start, end) => toggleTaskList(value, start, end));
  }
  if (shift && key.toLowerCase() === "k") {
    return run((value, start, end) => wrapFence(value, start, end));
  }
  if (shift && (key === "`" || key === "~" || code === "Backquote")) {
    return run((value, start, end) => wrapInline(value, start, end, "`"));
  }
  if (shift) return false;

  if (key.toLowerCase() === "b") {
    return run((value, start, end) => wrapInline(value, start, end, "**"));
  }
  if (key.toLowerCase() === "i") {
    return run((value, start, end) => wrapInline(value, start, end, "*"));
  }
  if (key.toLowerCase() === "u") {
    return run((value, start, end) => wrapInline(value, start, end, "<u>", "</u>"));
  }
  if (key.toLowerCase() === "t") {
    return run((value, start, end) => insertTable(value, start, end));
  }
  if (key === "]" || code === "BracketRight") {
    return run((value, start, end) => indentLines(value, start, end, 1));
  }
  if (key === "[" || code === "BracketLeft") {
    return run((value, start, end) => indentLines(value, start, end, -1));
  }
  if (key >= "0" && key <= "6") {
    return run((value, start, end) =>
      setHeading(value, start, end, Number(key) as 0 | 1 | 2 | 3 | 4 | 5 | 6),
    );
  }
  return false;
}

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
  const importNotes = useNotesStore((state) => state.importNotes);
  const makeBookFromNote = useNotesStore((state) => state.makeBookFromNote);
  const addChapter = useNotesStore((state) => state.addChapter);
  const editorEpoch = useNotesStore((state) => state.editorEpoch);
  const rawNotes = useNotesStore((state) => state.notes);

  const notes = useSortedNotes();
  const activeNote = useActiveNote();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [readerOpen, setReaderOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({
    text: "",
    href: "",
    image: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [syncConfig, setSyncConfig] = useState<SyncConfig>(DEFAULT_SYNC_CONFIG);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({
    state: "idle",
    message: "仅本机",
    at: null,
  });
  const syncingRef = useRef(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bookInputRef = useRef<HTMLInputElement>(null);
  const markdownInputRef = useRef<HTMLInputElement>(null);
  const txtInputRef = useRef<HTMLInputElement>(null);

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
      const state = useNotesStore.getState();
      const protectActive = document.activeElement?.id === "note-editor";
      const result = await runSync(config, state.notes, {
        activeId: state.activeId,
        protectActive,
      });
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

  useLayoutEffect(() => {
    applyTheme(readThemeConfig());
  }, []);

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
    const timer = window.setTimeout(() => void syncNow(true), 900);
    return () => window.clearTimeout(timer);
  }, [rawNotes, hydrated, syncNow]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "hidden") return;
      const config = readSyncConfig();
      if (config.provider !== "off" && config.autoSync) void syncNow(true);
    }, 4_000);
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const config = readSyncConfig();
      if (config.provider !== "off" && config.autoSync) void syncNow(true);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
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
        setLinkOpen(false);
        setExportOpen(false);
        setReaderOpen(false);
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

      if (mod && event.shiftKey && key.toLowerCase() === "e") {
        event.preventDefault();
        setExportOpen((open) => !open);
        return;
      }

      if (mod && key.toLowerCase() === "e") {
        event.preventDefault();
        cyclePreviewMode();
        return;
      }

      if (mod && event.shiftKey && key.toLowerCase() === "l") {
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

      if (mod && event.shiftKey && key.toLowerCase() === "i") {
        event.preventDefault();
        openImageDialog();
        return;
      }

      if (mod && !event.shiftKey && key.toLowerCase() === "k") {
        event.preventDefault();
        openLinkDialog();
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

      const overlayOpen =
        shortcutsOpen || pendingDelete || linkOpen || settingsOpen || exportOpen;
      const inEditor = target?.id === "note-editor";
      const inOtherField = typing && !inEditor;
      if (
        !overlayOpen &&
        !inOtherField &&
        !event.isComposing &&
        key !== "Process"
      ) {
        const applied = applyFormatHotkey(event, (mutator) => {
          if (!activeNote) return false;
          const selection = readEditorSelection();
          if (!selection) return false;
          const next = mutator(selection.value, selection.start, selection.end);
          writeEditorValue(
            next.value,
            { start: next.start, end: next.end },
            (value) => updateNote(activeNote.id, value),
          );
          return true;
        });
        if (applied) return;
      }

      if (overlayOpen) return;

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
    linkOpen,
    settingsOpen,
    exportOpen,
    selectNote,
    setSidebarOpen,
    shortcutsOpen,
    toggleSidebar,
    updateNote,
  ]);

  const charCount = useMemo(
    () => countChars(activeNote?.content ?? ""),
    [activeNote?.content],
  );

  function openLinkDialog() {
    if (!activeNote) {
      toast.message("先打开一篇笔记");
      return;
    }
    const selection = readEditorSelection();
    const selected = selection?.selected ?? "";
    const asUrl = looksLikeUrl(selected) ? normalizeHref(selected) : "";
    setLinkDraft({
      text: asUrl ? "" : selected,
      href: asUrl,
      image: false,
    });
    setLinkOpen(true);
  }

  function openImageDialog() {
    if (!activeNote) {
      toast.message("先打开一篇笔记");
      return;
    }
    const selection = readEditorSelection();
    const selected = selection?.selected ?? "";
    const asUrl = looksLikeUrl(selected) ? normalizeHref(selected) : "";
    setLinkDraft({
      text: asUrl ? "" : selected,
      href: asUrl,
      image: true,
    });
    setLinkOpen(true);
  }

  function handleInsertLink(draft: LinkDraft) {
    if (!activeNote) return;
    void (async () => {
      const selection = readEditorSelection();
      const start = selection?.start ?? activeNote.content.length;
      const end = selection?.end ?? activeNote.content.length;
      const source = selection?.value ?? activeNote.content;
      let href = draft.href;
      if (draft.image) {
        try {
          href = await resolveInsertedImage({ url: draft.href });
        } catch (error) {
          toast.message(error instanceof Error ? error.message : "图片处理失败");
          return;
        }
      }
      const next = wrapAsMarkup(source, start, end, draft.text, href, draft.image);
      writeEditorValue(next.value, next.cursor, (value) =>
        updateNote(activeNote.id, value),
      );
      setLinkOpen(false);
      toast.message(draft.image ? "已插入图片" : "已插入链接");
    })();
  }

  async function handleExport(format: ExportFormat) {
    if (!activeNote) {
      toast.message("先打开一篇笔记");
      return;
    }
    setExportBusy(true);
    try {
      const path = await exportNotes({
        format,
        note: activeNote,
        notes: rawNotes,
        onPicked: () => toast.message("正在生成…"),
      });
      setExportOpen(false);
      toast.message(`已保存到 ${path.split("/").pop() || path}`);
    } catch (error) {
      if (isCancelled(error)) return;
      toast.message(error instanceof Error ? error.message : "导出失败");
    } finally {
      setExportBusy(false);
    }
  }

  async function handleImportBook(file: File) {
    try {
      const parsed = await parseEpub(await file.arrayBuffer());
      for (const image of parsed.images) {
        const id = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
        const ext = extensionFor(image.mime, image.href);
        await putImage({
          id,
          name: image.href.split("/").pop() || `image.${ext}`,
          mime: image.mime,
          blob: new Blob([new Uint8Array(image.bytes)], { type: image.mime }),
        });
        const from = image.href;
        const to = `images/${id}.${ext}`;
        parsed.chapters = parsed.chapters.map((chapter) => ({
          ...chapter,
          content: chapter.content.replaceAll(from, to),
        }));
      }
      const imported = notesFromEpub(parsed);
      importNotes(imported);
      toast.message(`已导入《${parsed.title}》，${imported.length} 章`);
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "无法打开电子书");
    }
  }

  async function handleImportTextFiles(files: File[], format: "md" | "txt") {
    const imported: Note[] = [];
    try {
      for (const file of files) {
        const raw = await file.text();
        if (format === "txt") {
          imported.push({
            id: crypto.randomUUID(),
            content: raw.replace(/^\uFEFF/, ""),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            format: "txt",
          });
          continue;
        }
        imported.push(parseNoteFile(raw.replace(/^\uFEFF/, ""), crypto.randomUUID()));
      }
      if (imported.length === 0) {
        toast.message("没有可导入的文件");
        return;
      }
      importNotes(imported);
      toast.message(imported.length === 1 ? "已导入 1 篇笔记" : `已导入 ${imported.length} 篇笔记`);
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function handlePickImage(file: File) {
    if (!activeNote) return;
    const selection = readEditorSelection();
    const start = selection?.start ?? activeNote.content.length;
    const end = selection?.end ?? start;
    const source = selection?.value ?? activeNote.content;
    try {
      const next = await insertImageAtCursor(source, start, end, file, file.name);
      writeEditorValue(next.value, next.cursor, (value) =>
        updateNote(activeNote.id, value),
      );
      toast.message("已插入图片");
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "图片插入失败");
    }
  }

  function handleCreate(format: "md" | "txt" = "md") {
    createNote(format === "txt" ? { format: "txt" } : undefined);
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
  const bookChapters = activeNote?.bookId
    ? rawNotes
        .filter((note) => note.bookId === activeNote.bookId)
        .sort((a, b) => (a.chapterIndex ?? 0) - (b.chapterIndex ?? 0))
    : activeNote
      ? [activeNote]
      : [];

  if (readerOpen && activeNote) {
    return (
      <ReaderView
        notes={bookChapters}
        activeId={activeNote.id}
        onSelect={selectNote}
        onClose={() => setReaderOpen(false)}
        onChange={(id, value) => updateNote(id, value)}
        onAddChapter={() => {
          if (activeNote.bookId) addChapter(activeNote.bookId);
        }}
      />
    );
  }

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
          onCreate={() => handleCreate("md")}
          onCreateText={() => handleCreate("txt")}
          onImportMarkdown={() => markdownInputRef.current?.click()}
          onImportTxt={() => txtInputRef.current?.click()}
          onImportEpub={() => bookInputRef.current?.click()}
          onMakeBook={() => {
            if (!activeNote) {
              toast.message("先打开一篇笔记");
              return;
            }
            makeBookFromNote(activeNote.id);
            toast.message("已做成电子书，可继续添加章节或导出 EPUB");
          }}
          onAddChapter={() => {
            if (!activeNote?.bookId) {
              toast.message("先做成电子书");
              return;
            }
            addChapter(activeNote.bookId);
            toast.message("已新建章节");
          }}
          onCloseMobile={() => setSidebarOpen(false)}
          onOpenSettings={() => setSettingsOpen(true)}
          onReadBook={(id) => {
            selectNote(id);
            setReaderOpen(true);
          }}
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

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="插入图片"
            disabled={!activeNote}
            onClick={() => imageInputRef.current?.click()}
          >
            <ImagePlus />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="插入外链"
            disabled={!activeNote}
            onClick={openLinkDialog}
          >
            <Link2 />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            aria-label="阅读"
            disabled={!activeNote}
            onClick={() => setReaderOpen(true)}
          >
            <BookOpen />
          </Button>
          <div className="relative">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="导出"
              disabled={!activeNote}
              onClick={() => setExportOpen((open) => !open)}
            >
              <FileDown />
            </Button>
            <ExportMenu
              open={exportOpen}
              busy={exportBusy}
              hasBook={Boolean(activeNote?.bookId)}
              onOpenChange={setExportOpen}
              onExport={(format) => void handleExport(format)}
              onExportBook={() => void handleExport("epub")}
            />
          </div>

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
                  format={activeNote.format}
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
      <LinkDialog
        open={linkOpen}
        draft={linkDraft}
        onOpenChange={setLinkOpen}
        onInsert={handleInsertLink}
      />
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handlePickImage(file);
        }}
      />
      <input
        ref={bookInputRef}
        type="file"
        accept=".epub,application/epub+zip"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) void handleImportBook(file);
        }}
      />
      <input
        ref={markdownInputRef}
        type="file"
        accept=".md,.markdown,text/markdown"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void handleImportTextFiles(files, "md");
        }}
      />
      <input
        ref={txtInputRef}
        type="file"
        accept=".txt,text/plain"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void handleImportTextFiles(files, "txt");
        }}
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
