import { Plus, Search, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  formatRelativeTime,
  groupNotes,
  snippetFromContent,
  titleFromContent,
} from "@/lib/notes/format";
import type { Note } from "@/lib/notes/types";
import { cn } from "@/lib/utils";

type SidebarProps = {
  notes: Note[];
  activeId: string | null;
  query: string;
  now: number;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onCloseMobile: () => void;
  onOpenSettings: () => void;
  syncLabel: string;
};

export function Sidebar({
  notes,
  activeId,
  query,
  now,
  onQueryChange,
  onSelect,
  onCreate,
  onCloseMobile,
  onOpenSettings,
  syncLabel,
}: SidebarProps) {
  const groups = groupNotes(notes);

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
          className="md:hidden"
          aria-label="关闭笔记列表"
          onClick={onCloseMobile}
        >
          <X />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="同步与保存路径"
          onClick={onOpenSettings}
        >
          <Settings />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="新建笔记"
          onClick={onCreate}
        >
          <Plus />
        </Button>
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
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        aria-label="笔记列表"
      >
        {notes.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <p className="text-sm text-muted">
              {query.trim() ? "没有找到匹配的笔记" : "还没有笔记"}
            </p>
            {!query.trim() ? (
              <Button
                variant="subtle"
                className="mt-4"
                onClick={onCreate}
              >
                新建笔记
              </Button>
            ) : null}
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.label} className="mb-3">
              <div className="px-3 py-1.5 text-xs font-medium tracking-wide text-subtle">
                {group.label}
              </div>
              <ul role="listbox" aria-label={group.label}>
                {group.notes.map((note) => {
                  const selected = note.id === activeId;
                  return (
                    <li key={note.id} role="none">
                      <button
                        type="button"
                        role="option"
                        aria-selected={selected}
                        onClick={() => onSelect(note.id)}
                        className={cn(
                          "note-item btn-press flex w-full flex-col items-start rounded-lg px-3 py-3 text-left",
                          "transition-colors duration-(--motion-quick) ease-(--ease-out)",
                          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          selected
                            ? "bg-paper shadow-border"
                            : "hover:bg-overlay",
                        )}
                      >
                        <span className="w-full truncate font-medium text-fg">
                          {titleFromContent(note.content)}
                        </span>
                        <span className="mt-0.5 line-clamp-1 w-full text-xs text-muted">
                          {snippetFromContent(note.content)}
                        </span>
                        <span className="mt-1 text-xs text-subtle tabular-nums">
                          {formatRelativeTime(note.updatedAt, now)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );
}
