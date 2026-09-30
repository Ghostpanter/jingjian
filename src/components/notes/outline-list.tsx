import { useEffect, useRef } from "react";
import type { OutlineHeading } from "@/lib/notes/outline";
import { cn } from "@/lib/utils";

type OutlineListProps = {
  headings: OutlineHeading[];
  activeId?: string;
  height?: number;
  onJump: (heading: OutlineHeading) => void;
};

export function OutlineList({ headings, activeId, height, onJump }: OutlineListProps) {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !activeId) return;
    const current = root.querySelector("[aria-current='location']");
    current?.scrollIntoView({ block: "nearest" });
  }, [activeId, headings.length]);

  if (headings.length === 0) return null;
  return (
    <nav
      ref={rootRef}
      className={cn(
        "overflow-y-auto px-1 pb-1",
        height == null && "min-h-0 flex-1",
      )}
      aria-label="大纲"
      style={height != null ? { height } : undefined}
    >
      <ul>
        {headings.map((heading) => {
          const current = heading.id === activeId;
          return (
            <li key={`${heading.id}-${heading.offset}`}>
              <button
                type="button"
                aria-current={current ? "location" : undefined}
                onClick={() => onJump(heading)}
                className={cn(
                  "btn-press block w-full truncate rounded-sm py-1 pr-1.5 text-left text-xs leading-4",
                  current ? "bg-overlay font-medium text-fg" : "text-muted hover:bg-overlay hover:text-fg",
                )}
                style={{ paddingLeft: 8 + (heading.level - 1) * 12 }}
              >
                {heading.text}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
