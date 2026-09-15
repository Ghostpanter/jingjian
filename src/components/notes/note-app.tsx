import {
  BookOpen,
  Columns2,
  FileDown,
  FileOutput,
  ImagePlus,
  Keyboard,
  Link2,
  PanelLeft,
  Pencil,
  Save,
  Search,
  Send,
  Trash2,
  Eye,
} from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { toast, Toaster } from "sonner";
import { ActionSheet, DeleteFolderDialog, DeleteNoteDialog, FolderDialog, ShortcutsDialog } from "@/components/notes/dialogs";
import { EditorPane } from "@/components/notes/editor-pane";
import { ExportMenu } from "@/components/notes/export-menu";
import { FindBar } from "@/components/notes/find-bar";
import { LinkDialog, type LinkDraft } from "@/components/notes/link-dialog";
import { PreviewPane } from "@/components/notes/preview-pane";
import { ReaderView } from "@/components/notes/reader-view";
import { SettingsDialog } from "@/components/notes/settings-dialog";
import { Sidebar } from "@/components/notes/sidebar";
import { Button } from "@/components/ui/button";
import { exportNotes, type ExportFormat } from "@/lib/notes/export";
import { isCancelled } from "@/lib/notes/export-save";
import { notesFromEpub, parseEpub } from "@/lib/notes/epub";
import { formatCharCount, isLargeNote, titleFromContent } from "@/lib/notes/format";
import { foldersFromImportPaths, isImportableNoteName, isUnderFolder, notesInFolder, relativeDir } from "@/lib/notes/folder-tree";
import { exportFolderArchive } from "@/lib/notes/export-folder";
import { pickImportFolder, isImportCancelled, type ImportFolderFile } from "@/lib/notes/import-folder";
import { extractHeadings, type OutlineHeading } from "@/lib/notes/outline";
import { contentOffset, mapScroll, ratioAnchors, scrollMax } from "@/lib/notes/scroll-sync";
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
import { insertImageAtCursor, resolveInsertedImage, storeLocalImage } from "@/lib/notes/image-insert";
import { putImage, extensionFor } from "@/lib/notes/image-store";
import { recordTombstone, readSyncConfig, writeSyncConfig } from "@/lib/notes/sync-config";
import { runSync } from "@/lib/notes/sync";
import { applyTheme, readThemeConfig } from "@/lib/notes/theme";
import { DEFAULT_SYNC_CONFIG, type SyncConfig, type SyncStatus } from "@/lib/notes/sync-types";
import {
  hydrateNotesStore,
  flushNotesPersist,
  useActiveNote,
  useNotesStore,
  useSortedNotes,
} from "@/lib/notes/store";
import { parseNoteFile } from "@/lib/notes/markdown-file";
import { base64ToBytes, toArrayBuffer } from "@/lib/notes/bytes";
import {
  classifyIncoming,
  noteFromIncoming,
  stableIncomingId,
} from "@/lib/notes/open-incoming";
import { isNativeApp, nativeFolder, type LaunchFile } from "@/lib/notes/native-folder";
import { desktopApi, isDesktopApp } from "@/lib/notes/desktop";
import {
  autosaveNoteIfChanged,
  ensureFolderOnDisk,
  ensureLibraryRoot,
  isLibraryCancelled,
  persistMovedNote,
  removeFolderOnDisk,
  saveNoteAs,
  saveNoteToLibrary,
} from "@/lib/notes/library-fs";
import { isBlogConfigured, readBlogConfig } from "@/lib/notes/blog-config";
import { publishNoteToBlog } from "@/lib/notes/blog-publish";
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

async function notesFromEpubBuffer(
  buffer: ArrayBuffer,
): Promise<{ title: string; notes: Note[] }> {
  const parsed = await parseEpub(buffer);
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
  return { title: parsed.title, notes: notesFromEpub(parsed) };
}

function launchKey(file: LaunchFile): string {
  if (file.uri) return file.uri;
  if (file.text) return `text:${file.text}`;
  return "";
}

async function readIncoming(file: LaunchFile) {
  if (!file.uri) throw new Error("没有可打开的文件");
  if (isDesktopApp()) {
    const api = desktopApi();
    if (!api) throw new Error("无法读取文件");
    return api.readOpenFile({ path: file.uri, name: file.name });
  }
  return nativeFolder.readOpenUri({ uri: file.uri, name: file.name });
}

async function ingestLaunchFile(file: LaunchFile): Promise<void> {
  if (file.text && !file.uri) {
    const name = file.name || "分享.txt";
    const note = noteFromIncoming(
      file.text,
      classifyIncoming(name, file.mime),
      stableIncomingId(`text:${file.text}`),
    );
    useNotesStore.getState().importNotes([note]);
    toast.message("已打开分享的文字");
    return;
  }
  if (!file.uri) {
    toast.message("没有可打开的文件");
    return;
  }
  const opened = await readIncoming(file);
  const name = opened.name || file.name || "未命名";
  const mime = opened.mime || file.mime || "";
  const kind = classifyIncoming(name, mime);

  if (kind === "epub") {
    const buffer = await new Blob([toArrayBuffer(base64ToBytes(opened.data))]).arrayBuffer();
    const { title, notes } = await notesFromEpubBuffer(buffer);
    useNotesStore.getState().importNotes(notes);
    toast.message(`已导入《${title}》，${notes.length} 章`);
    return;
  }

  if (kind === "image") {
    const blob = new Blob([toArrayBuffer(base64ToBytes(opened.data))], {
      type: mime || "image/png",
    });
    const href = await storeLocalImage(blob, name);
    const alt = name.replace(/\.[^.]+$/, "") || "图片";
    useNotesStore.getState().importNotes([
      {
        id: stableIncomingId(file.uri),
        content: `# ${alt}\n\n![${alt}](${href})\n`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);
    toast.message(`已打开图片 ${alt}`);
    return;
  }

  if (kind === "markdown" || kind === "txt" || kind === "text") {
    const raw = opened.text ?? new TextDecoder().decode(base64ToBytes(opened.data));
    const note = noteFromIncoming(raw, kind, stableIncomingId(file.uri));
    useNotesStore.getState().importNotes([note]);
    toast.message(`已打开 ${name}`);
    return;
  }

  toast.message("暂不支持该文件");
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
  const folders = useNotesStore((state) => state.folders);
  const createFolder = useNotesStore((state) => state.createFolder);
  const moveNote = useNotesStore((state) => state.moveNote);
  const deleteFolder = useNotesStore((state) => state.deleteFolder);
  const editorEpoch = useNotesStore((state) => state.editorEpoch);
  const rawNotes = useNotesStore((state) => state.notes);

  const notes = useSortedNotes();
  const activeNote = useActiveNote();
  const [pendingDelete, setPendingDelete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"sync" | "theme" | "image" | "blog">("sync");
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
  const folderInputRef = useRef<HTMLInputElement>(null);
  const syncLock = useRef<"editor" | "preview" | null>(null);
  const syncTimer = useRef(0);
  const [activeFolder, setActiveFolder] = useState("");
  const [folderOpen, setFolderOpen] = useState(false);
  const [activeHeadingId, setActiveHeadingId] = useState("");
  const [itemMenu, setItemMenu] = useState<
    { kind: "note"; note: Note } | { kind: "folder"; path: string } | null
  >(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState("");
  const [pendingNoteDelete, setPendingNoteDelete] = useState<Note | null>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceMode, setReplaceMode] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [blogBusy, setBlogBusy] = useState(false);
  const [sidebarDragging, setSidebarDragging] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarPan = useRef<{ pointerId: number; startX: number; width: number; x: number } | null>(
    null,
  );

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
    setActiveHeadingId("");
  }, [activeNote?.id]);

  useEffect(() => {
    hydrateNotesStore();
    setSyncConfig(readSyncConfig());
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    void (async () => {
      await ensureLibraryRoot().catch(() => undefined);
      for (const folder of useNotesStore.getState().folders) {
        await ensureFolderOnDisk(folder).catch(() => undefined);
      }
    })();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    let chain = Promise.resolve();
    function onHide() {
      const state = useNotesStore.getState();
      const note = state.notes.find((item) => item.id === state.activeId) ?? null;
      chain = chain
        .then(async () => {
          await flushNotesPersist();
          await autosaveNoteIfChanged(note);
        })
        .catch(() => undefined);
    }
    function onVisibility() {
      if (document.visibilityState === "hidden") onHide();
    }
    document.addEventListener("visibilitychange", onVisibility);
    document.addEventListener("pause", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      document.removeEventListener("pause", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const native = isNativeApp();
    const desktop = isDesktopApp();
    if (!native && !desktop) return;
    const seen = new Set<string>();
    let cancelled = false;
    let handle: { remove: () => Promise<void> } | undefined;
    let unsub: (() => void) | undefined;

    const ingest = (file: LaunchFile) => {
      if (cancelled) return;
      const key = launchKey(file);
      if (!key || seen.has(key)) return;
      seen.add(key);
      void ingestLaunchFile(file).catch((error) => {
        toast.message(error instanceof Error ? error.message : "无法打开文件");
      });
    };

    if (native) {
      void nativeFolder
        .consumeLaunchFile()
        .then((file) => {
          if (file?.uri || file?.text) ingest(file);
        })
        .catch(() => {});
      void nativeFolder.addListener("openFile", ingest).then((listener) => {
        handle = listener;
      });
    }

    if (desktop) {
      const api = desktopApi();
      if (api) {
        void (async () => {
          for (;;) {
            const file = await api.consumeLaunchFile();
            if (!file?.uri && !file?.text) break;
            ingest(file);
          }
        })().catch(() => {});
        unsub = api.onOpenFile(ingest);
      }
    }

    return () => {
      cancelled = true;
      unsub?.();
      void handle?.remove();
    };
  }, [hydrated]);

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

  async function handleSave() {
    const state = useNotesStore.getState();
    const note = state.notes.find((item) => item.id === state.activeId) ?? null;
    if (!note) {
      toast.message("先打开一篇笔记");
      return;
    }
    try {
      const saved = await saveNoteToLibrary(note);
      toast.message(`已保存到 ${saved}`);
    } catch (error) {
      if (isLibraryCancelled(error) || isCancelled(error)) return;
      toast.message(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function handleSaveAs() {
    const state = useNotesStore.getState();
    const note = state.notes.find((item) => item.id === state.activeId) ?? null;
    if (!note) {
      toast.message("先打开一篇笔记");
      return;
    }
    try {
      const saved = await saveNoteAs(note);
      toast.message(`已另存为 ${saved.split(/[/\\]/).pop() || saved}`);
    } catch (error) {
      if (isLibraryCancelled(error) || isCancelled(error)) return;
      toast.message(error instanceof Error ? error.message : "保存失败");
    }
  }

  async function handlePublishBlog() {
    const state = useNotesStore.getState();
    const note = state.notes.find((item) => item.id === state.activeId) ?? null;
    if (!note) {
      toast.message("先打开一篇笔记");
      return;
    }
    if (!isBlogConfigured(readBlogConfig())) {
      toast.message("先在设置里填写博客仓库");
      setSettingsTab("blog");
      setSettingsOpen(true);
      return;
    }
    if (blogBusy) return;
    setBlogBusy(true);
    try {
      const result = await publishNoteToBlog(note);
      toast.message(result.updated ? `已更新 ${result.path}` : `已发布 ${result.path}`);
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "发布失败");
    } finally {
      setBlogBusy(false);
    }
  }

  function handleMoveNote(id: string, folder: string | null) {
    moveNote(id, folder);
    setActiveFolder(folder ?? "");
    toast.message(folder ? `已移入 ${folder}` : "已移到根目录");
    const note = useNotesStore.getState().notes.find((item) => item.id === id) ?? null;
    if (note) void persistMovedNote(note).catch(() => undefined);
  }

  function openFind(replace = false) {
    const state = useNotesStore.getState();
    if (!state.activeId) {
      toast.message("先打开一篇笔记");
      return;
    }
    setFindOpen(true);
    setReplaceMode(replace);
    if (state.previewMode === "preview") setPreviewMode("edit");
    window.setTimeout(() => document.getElementById("note-find")?.focus(), 0);
  }

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
        if (findOpen) {
          setFindOpen(false);
          return;
        }
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
        openFind(false);
        return;
      }

      if (mod && key.toLowerCase() === "h") {
        event.preventDefault();
        openFind(true);
        return;
      }

      if (mod && event.shiftKey && key.toLowerCase() === "e") {
        event.preventDefault();
        setExportOpen((open) => !open);
        return;
      }

      if (mod && !event.shiftKey && (key === "/" || event.code === "Slash")) {
        event.preventDefault();
        cyclePreviewMode();
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
        setSettingsTab("sync");
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

      if (mod && event.shiftKey && key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSaveAs();
        return;
      }

      if (mod && key.toLowerCase() === "s") {
        event.preventDefault();
        void handleSave();
        return;
      }

      if (mod && event.shiftKey && (key === "Backspace" || key === "Delete")) {
        event.preventDefault();
        if (activeNote) setPendingDelete(true);
        return;
      }

      const overlayOpen =
        shortcutsOpen || pendingDelete || linkOpen || settingsOpen || exportOpen || findOpen;
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
    findOpen,
    shortcutsOpen,
    selectNote,
    setSidebarOpen,
    toggleSidebar,
    updateNote,
  ]);

  const charCount = useMemo(
    () => formatCharCount(activeNote?.content ?? ""),
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
      const { title, notes } = await notesFromEpubBuffer(await file.arrayBuffer());
      importNotes(notes);
      toast.message(`已导入《${title}》，${notes.length} 章`);
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "无法打开电子书");
    }
  }

  async function handleImportTextFiles(files: File[], format?: "md" | "txt") {
    const imported: Note[] = [];
    try {
      for (const file of files) {
        const relative =
          (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
        const folder = relativeDir(relative);
        const kind =
          format ??
          (classifyIncoming(file.name, file.type) === "txt" ? "txt" : "md");
        const raw = await file.text();
        if (kind === "txt") {
          imported.push({
            id: crypto.randomUUID(),
            content: raw.replace(/^\uFEFF/, ""),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            format: "txt",
            ...(folder ? { folder } : {}),
          });
          continue;
        }
        const parsed = parseNoteFile(raw.replace(/^\uFEFF/, ""), crypto.randomUUID());
        imported.push(folder && !parsed.folder ? { ...parsed, folder } : parsed);
      }
      if (imported.length === 0) {
        toast.message("没有可导入的文件");
        return;
      }
      importNotes(imported);
      const large = imported.some((note) => isLargeNote(note.content));
      toast.message(
        large
          ? "文件较大，已用源码打开，避免卡住"
          : imported.length === 1
            ? "已导入 1 篇笔记"
            : `已导入 ${imported.length} 篇笔记`,
      );
    } catch (error) {
      toast.message(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function handleImportFolderFiles(files: File[]) {
    const notes = files.filter((file) =>
      isImportableNoteName(
        (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
      ),
    );
    if (!notes.length) {
      toast.message("文件夹里没有 Markdown 或 TXT");
      return;
    }
    await handleImportTextFiles(notes);
  }

  async function importFolderEntries(entries: ImportFolderFile[]) {
    const imported: Note[] = [];
    for (const file of entries) {
      const relative = file.relativePath || file.name;
      if (!isImportableNoteName(relative)) continue;
      const folder = relativeDir(relative);
      const kind = classifyIncoming(file.name, "") === "txt" ? "txt" : "md";
      const raw = file.content.replace(/^\uFEFF/, "");
      if (kind === "txt") {
        imported.push({
          id: crypto.randomUUID(),
          content: raw,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          format: "txt",
          ...(folder ? { folder } : {}),
        });
        continue;
      }
      const parsed = parseNoteFile(raw, crypto.randomUUID());
      imported.push(folder && !parsed.folder ? { ...parsed, folder } : parsed);
    }
    if (imported.length === 0) {
      toast.message("文件夹里没有 Markdown 或 TXT");
      return;
    }
    for (const folder of foldersFromImportPaths(entries.map((item) => item.relativePath))) {
      createFolder(folder);
      await ensureFolderOnDisk(folder).catch(() => undefined);
    }
    importNotes(imported);
    toast.message(imported.length === 1 ? "已导入 1 篇笔记" : `已导入 ${imported.length} 篇笔记`);
  }

  async function handleImportFolder() {
    try {
      const result = await pickImportFolder();
      if (result.kind === "input") {
        folderInputRef.current?.click();
        return;
      }
      if (result.kind === "empty") {
        const created = createFolder(result.folder);
        if (created) {
          setActiveFolder(created);
          await ensureFolderOnDisk(created).catch(() => undefined);
          toast.message(`已加入空文件夹 ${created}`);
        } else {
          toast.message("文件夹里没有 Markdown 或 TXT");
        }
        return;
      }
      await importFolderEntries(result.files);
    } catch (error) {
      if (isImportCancelled(error) || isCancelled(error)) return;
      toast.message(error instanceof Error ? error.message : "导入失败");
    }
  }

  async function handleDroppedFiles(files: File[]) {
    const nested = files.filter((file) =>
      ((file as File & { webkitRelativePath?: string }).webkitRelativePath || "").includes("/"),
    );
    if (nested.length) {
      await handleImportFolderFiles(files);
      return;
    }
    const books = files.filter((file) => classifyIncoming(file.name, file.type) === "epub");
    const markdown = files.filter((file) => classifyIncoming(file.name, file.type) === "markdown");
    const txt = files.filter((file) => classifyIncoming(file.name, file.type) === "txt");
    for (const book of books) await handleImportBook(book);
    if (markdown.length) await handleImportTextFiles(markdown, "md");
    if (txt.length) await handleImportTextFiles(txt, "txt");
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

  function handleCreate(format: "md" | "txt" = "md", folder = activeFolder) {
    createNote({
      ...(format === "txt" ? { format: "txt" as const } : {}),
      ...(folder ? { folder } : {}),
    });
    window.setTimeout(() => document.getElementById("note-editor")?.focus(), 0);
  }

  function headingAnchors() {
    const editor = document.getElementById("note-editor") as HTMLTextAreaElement | null;
    const preview = document.getElementById("note-preview");
    const article = preview?.querySelector("article");
    if (!editor || !preview || !activeNote) return { from: [] as number[], to: [] as number[] };
    const headings = extractHeadings(activeNote.content);
    const els = [...(article?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? [])] as HTMLElement[];
    const rootRect = preview.getBoundingClientRect();
    return ratioAnchors(
      headings.map((item) => item.offset),
      activeNote.content.length,
      els.map((el) =>
        contentOffset(el.getBoundingClientRect().top, rootRect.top, preview.scrollTop),
      ),
      Math.max(1, preview.scrollHeight),
    );
  }

  function updateActiveHeading() {
    const preview = document.getElementById("note-preview");
    const article = preview?.querySelector("article");
    const els = [...(article?.querySelectorAll("h1,h2,h3,h4,h5,h6") ?? [])] as HTMLElement[];
    if (!preview || els.length === 0) {
      setActiveHeadingId("");
      return;
    }
    const probe = preview.getBoundingClientRect().top + 20;
    let current = els[0].id;
    for (const el of els) {
      if (el.getBoundingClientRect().top <= probe) current = el.id;
    }
    setActiveHeadingId((prev) => (prev === current ? prev : current));
  }

  function syncScroll(from: "editor" | "preview") {
    if (previewMode !== "split") {
      if (from === "preview") updateActiveHeading();
      return;
    }
    if (syncLock.current && syncLock.current !== from) return;
    const editor = document.getElementById("note-editor") as HTMLTextAreaElement | null;
    const preview = document.getElementById("note-preview");
    if (!editor || !preview) return;
    const anchors = headingAnchors();
    syncLock.current = from;
    if (from === "editor") {
      preview.scrollTop = mapScroll(
        editor.scrollTop,
        scrollMax(editor.scrollHeight, editor.clientHeight),
        scrollMax(preview.scrollHeight, preview.clientHeight),
        anchors.from,
        anchors.to,
      );
    } else {
      editor.scrollTop = mapScroll(
        preview.scrollTop,
        scrollMax(preview.scrollHeight, preview.clientHeight),
        scrollMax(editor.scrollHeight, editor.clientHeight),
        anchors.to,
        anchors.from,
      );
    }
    updateActiveHeading();
    window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      syncLock.current = null;
    }, 90);
  }

  function jumpHeading(heading: OutlineHeading) {
    const editor = document.getElementById("note-editor") as HTMLTextAreaElement | null;
    const preview = document.getElementById("note-preview");
    const target = preview?.querySelector(
      `#${CSS.escape(heading.id)}`,
    ) as HTMLElement | null;
    syncLock.current = "preview";
    if (preview && target) {
      const top = contentOffset(
        target.getBoundingClientRect().top,
        preview.getBoundingClientRect().top,
        preview.scrollTop,
      );
      preview.scrollTop = Math.max(0, top - 8);
    }
    if (editor) {
      const max = scrollMax(editor.scrollHeight, editor.clientHeight);
      editor.scrollTop = (heading.offset / Math.max(1, editor.value.length)) * max;
      editor.focus();
      editor.setSelectionRange(heading.offset, heading.offset);
    }
    setActiveHeadingId(heading.id);
    window.setTimeout(() => {
      syncLock.current = null;
    }, 90);
  }

  function closeSidebar() {
    setSidebarOpen(false);
    setDesktopCollapsed(true);
  }

  function onSidebarPanMove(event: ReactPointerEvent) {
    const state = sidebarPan.current;
    const aside = sidebarRef.current;
    if (!state || state.pointerId !== event.pointerId || !aside) return;
    const x = Math.min(0, Math.max(-state.width, event.clientX - state.startX));
    state.x = x;
    aside.style.setProperty("--sidebar-drag", `${x}px`);
  }

  function onSidebarPanEnd(event: ReactPointerEvent) {
    const state = sidebarPan.current;
    if (!state || state.pointerId !== event.pointerId) return;
    sidebarPan.current = null;
    setSidebarDragging(false);
    const aside = sidebarRef.current;
    aside?.style.removeProperty("--sidebar-drag");
    if (state.x < -state.width * 0.32) closeSidebar();
  }

  function onSidebarHandleDown(event: ReactPointerEvent<HTMLDivElement>) {
    const aside = sidebarRef.current;
    if (!aside) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    sidebarPan.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      width: aside.getBoundingClientRect().width,
      x: 0,
    };
    setSidebarDragging(true);
  }

  async function handleExportFolder(path: string) {
    try {
      const saved = await exportFolderArchive(rawNotes, path, () => toast.message("正在生成…"));
      toast.message(`已保存到 ${saved.split("/").pop() || saved}`);
    } catch (error) {
      if (isCancelled(error)) return;
      toast.message(error instanceof Error ? error.message : "导出失败");
    }
  }

  function handleConfirmFolderDelete() {
    const path = pendingFolderDelete;
    if (!path) return;
    const removed = deleteFolder(path);
    for (const id of removed) recordTombstone(id);
    if (isUnderFolder(path, activeFolder) || activeFolder === path) setActiveFolder("");
    setPendingFolderDelete("");
    void removeFolderOnDisk(path).catch(() => undefined);
    toast.message(removed.length ? `已删除文件夹及 ${removed.length} 篇笔记` : "已删除文件夹");
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
  const headings =
    activeNote && activeNote.format !== "txt" ? extractHeadings(activeNote.content) : [];

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
        sidebarDragging && "is-sidebar-dragging",
      )}
      onDragOver={(event) => {
        if ([...event.dataTransfer.types].includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => {
        const files = [...event.dataTransfer.files];
        if (!files.length) return;
        event.preventDefault();
        void handleDroppedFiles(files);
      }}
    >
      <Toaster
        position="bottom-center"
        duration={1600}
        className="toaster"
        offset={24}
      />

      <button
        type="button"
        className="app-sidebar-backdrop"
        aria-label="关闭笔记列表"
        tabIndex={-1}
        onClick={() => setSidebarOpen(false)}
      />

      <aside ref={sidebarRef} className="app-sidebar" aria-label="笔记列表">
        <div
          className="sidebar-edge-handle"
          aria-label="向左拖动可关闭文件列表"
          onPointerDown={onSidebarHandleDown}
          onPointerMove={onSidebarPanMove}
          onPointerUp={onSidebarPanEnd}
          onPointerCancel={onSidebarPanEnd}
        />
        <Sidebar
          notes={notes}
          folders={folders}
          activeId={activeNote?.id ?? null}
          activeFolder={activeFolder}
          query={query}
          now={now}
          headings={headings}
          activeHeadingId={activeHeadingId}
          onQueryChange={setQuery}
          onSelect={(id) => {
            const note = rawNotes.find((item) => item.id === id);
            setActiveFolder(note?.folder ?? "");
            selectNote(id);
          }}
          onSelectFolder={setActiveFolder}
          onCreate={() => handleCreate("md")}
          onCreateText={() => handleCreate("txt")}
          onCreateFolder={() => setFolderOpen(true)}
          onCreateInFolder={(path) => {
            setActiveFolder(path);
            handleCreate("md", path);
          }}
          onImportMarkdown={() => markdownInputRef.current?.click()}
          onImportTxt={() => txtInputRef.current?.click()}
          onImportFolder={() => void handleImportFolder()}
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
          onOpenSettings={() => {
            setSettingsTab("sync");
            setSettingsOpen(true);
          }}
          onMoveNote={handleMoveNote}
          onNoteMenu={(note) => setItemMenu({ kind: "note", note })}
          onFolderMenu={(path) => setItemMenu({ kind: "folder", path })}
          onJumpHeading={jumpHeading}
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
            className="phone-only"
            aria-label="笔记列表"
            onClick={() => setSidebarOpen(true)}
          >
            <PanelLeft />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="pad-only"
            aria-label={desktopCollapsed ? "显示文件列表" : "收起文件列表"}
            onClick={() => setDesktopCollapsed((value) => !value)}
          >
            <PanelLeft />
          </Button>

          <div className="app-toolbar-spacer" />

          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="保存到文档/jingjian"
            disabled={!activeNote}
            onClick={() => void handleSave()}
          >
            <Save />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="另存为"
            disabled={!activeNote}
            onClick={() => void handleSaveAs()}
          >
            <FileOutput />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="发布到博客"
            disabled={!activeNote || blogBusy}
            onClick={() => void handlePublishBlog()}
          >
            <Send />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="查找替换"
            disabled={!activeNote}
            onClick={() => openFind(true)}
          >
            <Search />
          </Button>
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

        {activeNote ? (
          <FindBar
            open={findOpen}
            replaceMode={replaceMode}
            content={activeNote.content}
            onClose={() => setFindOpen(false)}
            onReplaceMode={setReplaceMode}
            onReplace={(next, selection) => {
              writeEditorValue(next, selection, (value) =>
                updateNote(activeNote.id, value),
              );
            }}
          />
        ) : null}

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
                  onImportFiles={(files) => void handleDroppedFiles(files)}
                  onScroll={() => syncScroll("editor")}
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
                  onScroll={() => syncScroll("preview")}
                />
              ) : (
                <EmptyEditor onCreate={handleCreate} />
              )}
            </div>
          ) : null}
        </div>

        <footer className="app-status">
          <span className="tabular-nums">{charCount}</span>
          <span>{syncConfig.provider === "off" ? "已自动保存" : syncStatus.message}</span>
        </footer>
      </section>

      <DeleteNoteDialog
        open={(pendingDelete && Boolean(activeNote)) || Boolean(pendingNoteDelete)}
        title={
          pendingNoteDelete
            ? titleFromContent(pendingNoteDelete.content)
            : activeNote
              ? titleFromContent(activeNote.content)
              : ""
        }
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(false);
            setPendingNoteDelete(null);
          }
        }}
        onConfirm={() => {
          const target = pendingNoteDelete ?? activeNote;
          if (!target) return;
          recordTombstone(target.id);
          deleteNote(target.id);
          setPendingDelete(false);
          setPendingNoteDelete(null);
          toast.message("笔记已删除");
        }}
      />
      <DeleteFolderDialog
        open={Boolean(pendingFolderDelete)}
        folder={pendingFolderDelete}
        noteCount={pendingFolderDelete ? notesInFolder(rawNotes, pendingFolderDelete).length : 0}
        onOpenChange={(open) => {
          if (!open) setPendingFolderDelete("");
        }}
        onConfirm={handleConfirmFolderDelete}
      />
      <ActionSheet
        open={Boolean(itemMenu)}
        title={
          itemMenu?.kind === "folder"
            ? itemMenu.path.split("/").pop() || itemMenu.path
            : itemMenu?.kind === "note"
              ? titleFromContent(itemMenu.note.content)
              : ""
        }
        actions={
          itemMenu?.kind === "folder"
            ? [
                { id: "export", label: "导出文件夹" },
                { id: "delete", label: "删除文件夹", destructive: true },
              ]
            : itemMenu?.kind === "note"
              ? [
                  ...(itemMenu.note.folder
                    ? [{ id: "unfile", label: "移到根目录" }]
                    : []),
                  { id: "delete", label: "删除笔记", destructive: true },
                ]
              : []
        }
        onOpenChange={(open) => {
          if (!open) setItemMenu(null);
        }}
        onSelect={(id) => {
          if (!itemMenu) return;
          if (itemMenu.kind === "folder" && id === "export") {
            void handleExportFolder(itemMenu.path);
            return;
          }
          if (itemMenu.kind === "folder" && id === "delete") {
            setPendingFolderDelete(itemMenu.path);
            return;
          }
          if (itemMenu.kind === "note" && id === "unfile") {
            handleMoveNote(itemMenu.note.id, null);
            return;
          }
          if (itemMenu.kind === "note" && id === "delete") {
            setPendingNoteDelete(itemMenu.note);
          }
        }}
      />
      <SettingsDialog
        open={settingsOpen}
        config={syncConfig}
        initialTab={settingsTab}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open) setSettingsTab("sync");
        }}
        onSave={(next) => {
          writeSyncConfig(next);
          setSyncConfig(next);
        }}
        onSyncNow={() => void syncNow(false)}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <LinkDialog
        open={linkOpen}
        draft={linkDraft}
        onOpenChange={setLinkOpen}
        onInsert={handleInsertLink}
      />
      <FolderDialog
        open={folderOpen}
        onOpenChange={setFolderOpen}
        onConfirm={(name) => {
          const parent = activeFolder ? `${activeFolder}/` : "";
          const created = createFolder(`${parent}${name}`);
          if (created) {
            setActiveFolder(created);
            void ensureFolderOnDisk(created)
              .then(() => toast.message(`已创建 ${created}`))
              .catch(() => toast.message(`已创建 ${created}`));
          }
        }}
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
      <input
        ref={folderInputRef}
        type="file"
        multiple
        className="hidden"
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) void handleImportFolderFiles(files);
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
