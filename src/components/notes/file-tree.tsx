import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { snippetFromContent, titleFromContent } from "@/lib/notes/format";
import type { TreeNode } from "@/lib/notes/folder-tree";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type FileTreeProps = {
  nodes: TreeNode[];
  activeId: string | null;
  activeFolder: string;
  expanded: Set<string>;
  depth?: number;
  onSelect: (id: string) => void;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateInFolder: (path: string) => void;
  onMoveNote: (id: string, folder: string | null) => void;
};

export function FileTree({
  nodes,
  activeId,
  activeFolder,
  expanded,
  depth = 0,
  onSelect,
  onToggle,
  onSelectFolder,
  onCreateInFolder,
  onMoveNote,
}: FileTreeProps) {
  return (
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
            onSelect={onSelect}
            onToggle={onToggle}
            onSelectFolder={onSelectFolder}
            onCreateInFolder={onCreateInFolder}
            onMoveNote={onMoveNote}
          />
        ) : (
          <NoteRow
            key={node.note.id}
            note={node.note}
            selected={node.note.id === activeId}
            depth={depth}
            onSelect={onSelect}
          />
        ),
      )}
    </ul>
  );
}

function FolderRow({
  node,
  activeId,
  activeFolder,
  expanded,
  depth,
  onSelect,
  onToggle,
  onSelectFolder,
  onCreateInFolder,
  onMoveNote,
}: {
  node: Extract<TreeNode, { kind: "folder" }>;
  activeId: string | null;
  activeFolder: string;
  expanded: Set<string>;
  depth: number;
  onSelect: (id: string) => void;
  onToggle: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateInFolder: (path: string) => void;
  onMoveNote: (id: string, folder: string | null) => void;
}) {
  const open = expanded.has(node.path);
  const selected = activeFolder === node.path;
  const Icon = open ? FolderOpen : Folder;

  return (
    <li role="none">
      <div
        data-folder-drop={node.path}
        className={cn(
          "note-item btn-press flex w-full items-center gap-1 rounded-lg py-1.5 pr-2 text-left text-sm",
          selected ? "bg-overlay" : "hover:bg-overlay",
        )}
        style={{ paddingLeft: 8 + depth * 14 }}
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
            onSelectFolder(node.path);
            if (!open) onToggle(node.path);
          }}
        >
          <Icon className="size-3.5 shrink-0 text-muted" />
          <span className="truncate font-medium text-fg">{node.name}</span>
        </button>
        <button
          type="button"
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
          onSelect={onSelect}
          onToggle={onToggle}
          onSelectFolder={onSelectFolder}
          onCreateInFolder={onCreateInFolder}
          onMoveNote={onMoveNote}
        />
      ) : null}
    </li>
  );
}

function NoteRow({
  note,
  selected,
  depth,
  onSelect,
}: {
  note: Note;
  selected: boolean;
  depth: number;
  onSelect: (id: string) => void;
}) {
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
        onClick={() => onSelect(note.id)}
        style={{ paddingLeft: 28 + depth * 14 }}
        className={cn(
          "note-item btn-press flex w-full flex-col items-start rounded-lg py-2.5 pr-3 text-left",
          "transition-colors duration-(--motion-quick) ease-(--ease-out)",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          selected ? "bg-paper shadow-border" : "hover:bg-overlay",
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
