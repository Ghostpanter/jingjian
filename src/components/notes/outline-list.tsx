import type { OutlineHeading } from "@/lib/notes/outline";
import { cn } from "@/lib/utils";

type OutlineListProps = {
  headings: OutlineHeading[];
  activeId?: string;
  onJump: (heading: OutlineHeading) => void;
};

export function OutlineList({ headings, activeId, onJump }: OutlineListProps) {
  if (headings.length === 0) return null;
  return (
    <div className="outline-panel shrink-0 border-t border-border">
      <div className="px-3 py-2 text-xs font-medium tracking-wide text-subtle">大纲</div>
      <nav className="max-h-40 overflow-y-auto px-1 pb-2" aria-label="大纲">
        <ul>
          {headings.map((heading) => (
            <li key={`${heading.id}-${heading.offset}`}>
              <button
                type="button"
                onClick={() => onJump(heading)}
                className={cn(
                  "btn-press block w-full truncate rounded-md py-1 pr-2 text-left text-xs",
                  heading.id === activeId ? "font-medium text-fg" : "text-muted hover:text-fg",
                )}
                style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
              >
                {heading.text}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
