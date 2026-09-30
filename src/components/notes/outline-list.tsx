import type { OutlineHeading } from "@/lib/notes/outline";
import { cn } from "@/lib/utils";

type OutlineListProps = {
  headings: OutlineHeading[];
  activeId?: string;
  height?: number;
  onJump: (heading: OutlineHeading) => void;
};

export function OutlineList({ headings, activeId, height = 160, onJump }: OutlineListProps) {
  if (headings.length === 0) return null;
  return (
    <nav className="overflow-y-auto px-1 pb-1" aria-label="大纲" style={{ height }}>
      <ul>
        {headings.map((heading) => (
          <li key={`${heading.id}-${heading.offset}`}>
            <button
              type="button"
              onClick={() => onJump(heading)}
              className={cn(
                "btn-press block w-full truncate rounded-sm py-0.5 pr-1.5 text-left text-xs leading-4",
                heading.id === activeId ? "font-medium text-fg" : "text-muted hover:text-fg",
              )}
              style={{ paddingLeft: 6 + (heading.level - 1) * 10 }}
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
