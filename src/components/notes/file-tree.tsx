import { useRef, useState } from "react";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { snippetFromContent, titleFromContent } from "@/lib/notes/format";
import type { TreeNode } from "@/lib/notes/folder-tree";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

const LONG_PRESS_MS = 430;
const MOVE_PX = 10;

type DragState = {
  id: string;
  title: string;
  x: number;
  y: number;
  over: string | null;
};

type FileTreeProps = {
  nodes: TreeNode[];
  activeId: string | null;
  activeFolder: string;
  expanded: Set<string>;
  depth?: number;
  drag?: DragState | null;
  onDragChange?: (drag: DragState | null) => void;
  onSelect: (id: string) => void;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateInFolder: (path: string) => void;
  onMoveNote: (id: string, folder: string | null) => void;
  onNoteMenu: (note: Note) => void;
  onFolderMenu: (path: string) => void;
};

export function FileTree({
  nodes,
  activeId,
  activeFolder,
  expanded,
  depth = 0,
  drag = null,
  onDragChange,
  onSelect,
  onToggle,
  onSelectFolder,
  onCreateInFolder,
  onMoveNote,
  onNoteMenu,
  onFolderMenu,
}: FileTreeProps) {
  const [localDrag, setLocalDrag] = useState<DragState | null>(null);
  const dragState = depth === 0 ? (drag ?? localDrag) : drag;
  const setDrag = depth === 0 ? (onDragChange ?? setLocalDrag) : onDragChange;

  return (
    <>
      <ul role="group" className={depth === 0 ? "px-0" : ""}>
        {nodes.map((node) =>
          node.kind === "folder" ? (
            <FolderRow
              key={node.path}
              node={node}
              activeId={activeId}
              activeFolder={activeFolder}
              expanded={expanded}
              depth={depth}
              drag={dragState ?? null}
              onDragChange={setDrag}
              onSelect={onSelect}
              onToggle={onToggle}
              onSelectFolder={onSelectFolder}
              onCreateInFolder={onCreateInFolder}
              onMoveNote={onMoveNote}
              onNoteMenu={onNoteMenu}
              onFolderMenu={onFolderMenu}
            />
          ) : (
            <NoteRow
              key={node.note.id}
              note={node.note}
              selected={node.note.id === activeId}
              depth={depth}
              dragging={dragState?.id === node.note.id}
              onDragChange={setDrag}
              onSelect={onSelect}
              onMoveNote={onMoveNote}
              onNoteMenu={onNoteMenu}
            />
          ),
        )}
      </ul>
      {depth === 0 && dragState ? (
        <div
          className="pointer-events-none fixed z-50 max-w-48 truncate rounded-md bg-paper px-2 py-1 text-xs text-fg shadow-raised"
          style={{ left: dragState.x + 12, top: dragState.y + 12 }}
        >
          {dragState.title}
        </div>
      ) : null}
    </>
  );
}

function dropFolderAt(x: number, y: number): string | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  const folder = el?.closest("[data-folder-drop]") as HTMLElement | null;
  if (folder?.dataset.folderDrop != null) return folder.dataset.folderDrop;
  if (el?.closest("[data-tree-root]")) return "";
  return null;
}

function FolderRow({
  node,
  activeId,
  activeFolder,
  expanded,
  depth,
  drag,
  onDragChange,
  onSelect,
  onToggle,
  onSelectFolder,
  onCreateInFolder,
  onMoveNote,
  onNoteMenu,
  onFolderMenu,
}: {
  node: Extract<TreeNode, { kind: "folder" }>;
  activeId: string | null;
  activeFolder: string;
  expanded: Set<string>;
  depth: number;
  drag: DragState | null;
  onDragChange?: (drag: DragState | null) => void;
  onSelect: (id: string) => void;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateInFolder: (path: string) => void;
  onMoveNote: (id: string, folder: string | null) => void;
  onNoteMenu: (note: Note) => void;
  onFolderMenu: (path: string) => void;
}) {
  const open = expanded.has(node.path);
  const selected = activeFolder === node.path;
  const Icon = open ? FolderOpen : Folder;
  const press = useRef<{ timer: number; x: number; y: number; armed: boolean } | null>(null);

  function clearPress() {
    if (press.current?.timer) window.clearTimeout(press.current.timer);
    press.current = null;
  }

  return (
    <li role="none">
      <div
        data-folder-drop={node.path}
        className={cn(
          "note-item btn-press flex w-full items-center gap-1 rounded-lg py-1.5 pr-2 text-left text-sm select-none",
          selected || drag?.over === node.path ? "bg-overlay" : "hover:bg-overlay",
          drag?.over === node.path && "folder-drop-active",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
        onContextMenu={(event) => {
          event.preventDefault();
          onFolderMenu(node.path);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          if ((event.target as HTMLElement).closest("[data-skip-press]")) return;
          press.current = {
            timer: window.setTimeout(() => {
              if (press.current) press.current.armed = true;
            }, LONG_PRESS_MS),
            x: event.clientX,
            y: event.clientY,
            armed: false,
          };
        }}
        onPointerMove={(event) => {
          if (!press.current) return;
          const dx = event.clientX - press.current.x;
          const dy = event.clientY - press.current.y;
          if (Math.hypot(dx, dy) > MOVE_PX) clearPress();
        }}
        onPointerUp={() => {
          const armed = press.current?.armed;
          clearPress();
          if (armed) onFolderMenu(node.path);
        }}
        onPointerCancel={clearPress}
        onDragOver={(event) => {
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          const id = event.dataTransfer.getData("text/jingjian-note");
          if (!id) return;
          event.preventDefault();
          event.stopPropagation();
          onMoveNote(id, node.path);
        }}
      >
        <button
          type="button"
          data-skip-press=""
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-sm text-subtle hover:text-fg"
          aria-label={open ? `折叠 ${node.name}` : `展开 ${node.name}`}
          aria-expanded={open}
          onClick={() => onToggle(node.path)}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", open && "rotate-90")} />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5"
          onClick={() => {
            if (press.current?.armed) return;
            onSelectFolder(node.path);
            if (!open) onToggle(node.path);
          }}
        >
          <Icon className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium text-fg">{node.name}</span>
        </button>
        <button
          type="button"
          data-skip-press=""
          className="shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] text-muted hover:text-fg"
          onClick={() => onCreateInFolder(node.path)}
        >
          新建
        </button>
      </div>
      {open ? (
        <FileTree
          nodes={node.children}
          activeId={activeId}
          activeFolder={activeFolder}
          expanded={expanded}
          depth={depth + 1}
          drag={drag}
          onDragChange={onDragChange}
          onSelect={onSelect}
          onToggle={onToggle}
          onSelectFolder={onSelectFolder}
          onCreateInFolder={onCreateInFolder}
          onMoveNote={onMoveNote}
          onNoteMenu={onNoteMenu}
          onFolderMenu={onFolderMenu}
        />
      ) : null}
    </li>
  );
}

function NoteRow({
  note,
  selected,
  depth,
  dragging,
  onDragChange,
  onSelect,
  onMoveNote,
  onNoteMenu,
}: {
  note: Note;
  selected: boolean;
  depth: number;
  dragging: boolean;
  onDragChange?: (drag: DragState | null) => void;
  onSelect: (id: string) => void;
  onMoveNote: (id: string, folder: string | null) => void;
  onNoteMenu: (note: Note) => void;
}) {
  const press = useRef<{
    timer: number;
    x: number;
    y: number;
    armed: boolean;
    dragging: boolean;
    pointerId: number;
  } | null>(null);
  const skipClick = useRef(false);

  function clearPress() {
    if (press.current?.timer) window.clearTimeout(press.current.timer);
    press.current = null;
  }

  return (
    <li role="none">
      <button
        type="button"
        role="option"
        aria-selected={selected}
        draggable
        onDragStart={(event) => {
          event.dataTransfer.setData("text/jingjian-note", note.id);
          event.dataTransfer.effectAllowed = "move";
        }}
        onContextMenu={(event) => {
          event.preventDefault();
          onNoteMenu(note);
        }}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") return;
          press.current = {
            timer: window.setTimeout(() => {
              if (press.current) press.current.armed = true;
            }, LONG_PRESS_MS),
            x: event.clientX,
            y: event.clientY,
            armed: false,
            dragging: false,
            pointerId: event.pointerId,
          };
        }}
        onPointerMove={(event) => {
          const state = press.current;
          if (!state) return;
          const dx = event.clientX - state.x;
          const dy = event.clientY - state.y;
          const dist = Math.hypot(dx, dy);
          if (!state.armed && !state.dragging && dist > MOVE_PX) {
            clearPress();
            return;
          }
          if (state.armed && dist > MOVE_PX) {
            if (!state.dragging) {
              state.dragging = true;
              (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
            }
            skipClick.current = true;
            const over = dropFolderAt(event.clientX, event.clientY);
            onDragChange?.({
              id: note.id,
              title: titleFromContent(note.content),
              x: event.clientX,
              y: event.clientY,
              over,
            });
          }
        }}
        onPointerUp={(event) => {
          const state = press.current;
          const armed = state?.armed;
          const wasDragging = state?.dragging;
          clearPress();
          onDragChange?.(null);
          if (wasDragging) {
            skipClick.current = true;
            const over = dropFolderAt(event.clientX, event.clientY);
            if (over != null) onMoveNote(note.id, over || null);
            return;
          }
          if (armed) {
            skipClick.current = true;
            onNoteMenu(note);
          }
        }}
        onPointerCancel={() => {
          clearPress();
          onDragChange?.(null);
        }}
        onClick={() => {
          if (skipClick.current) {
            skipClick.current = false;
            return;
          }
          onSelect(note.id);
        }}
        style={{ paddingLeft: 28 + depth * 14 }}
        className={cn(
          "note-item btn-press flex w-full flex-col items-start rounded-lg py-2.5 pr-3 text-left select-none",
          "transition-colors duration-(--motion-quick) ease-(--ease-out)",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          selected ? "bg-paper shadow-border" : "hover:bg-overlay",
          dragging && "opacity-50",
        )}
      >
        <span className="flex w-full items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-medium text-fg">
            {titleFromContent(note.content)}
          </span>
          {note.format === "txt" ? (
            <span className="shrink-0 text-[10px] tracking-wide text-subtle">TXT</span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-1 w-full text-xs text-muted">
          {snippetFromContent(note.content)}
        </span>
      </button>
    </li>
  );
}
