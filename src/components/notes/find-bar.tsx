import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  applyReplacement,
  findMatches,
  indexNear,
  isFindError,
  nextIndex,
  replaceAllMatches,
  type TextRange,
} from "@/lib/notes/find-replace";
import { cn } from "@/lib/utils";

type FindBarProps = {
  open: boolean;
  replaceMode: boolean;
  content: string;
  onClose: () => void;
  onReplaceMode: (open: boolean) => void;
  onReplace: (next: string, selection: { start: number; end: number }) => void;
};

export function FindBar({
  open,
  replaceMode,
  content,
  onClose,
  onReplaceMode,
  onReplace,
}: FindBarProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [index, setIndex] = useState(0);

  const result = useMemo(
    () => findMatches(content, { query, regex, caseSensitive, wholeWord }),
    [content, query, regex, caseSensitive, wholeWord],
  );
  const error = isFindError(result) ? result.error : "";
  const matches = isFindError(result) ? [] : result;
  const current = matches[index] ?? null;

  useEffect(() => {
    if (!open) return;
    const selected = (() => {
      const el = document.getElementById("note-editor");
      if (!(el instanceof HTMLTextAreaElement)) return "";
      const text = el.value.slice(el.selectionStart, el.selectionEnd);
      return text && !text.includes("\n") ? text : "";
    })();
    if (selected) setQuery(selected);
    setIndex(0);
    window.setTimeout(() => {
      const input = document.getElementById("note-find");
      if (input instanceof HTMLInputElement) input.select();
    }, 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = document.getElementById("note-editor");
    const cursor = el instanceof HTMLTextAreaElement ? el.selectionStart : 0;
    setIndex(indexNear(matches, cursor));
  }, [open, query, regex, caseSensitive, wholeWord, content, matches]);

  function selectMatch(range: TextRange | null) {
    const el = document.getElementById("note-editor");
    if (!(el instanceof HTMLTextAreaElement) || !range) return;
    const active = document.activeElement;
    el.focus();
    el.setSelectionRange(range.start, range.end);
    if (active instanceof HTMLElement && active !== el) active.focus();
  }

  function jump(direction: 1 | -1) {
    if (matches.length === 0) return;
    const next = nextIndex(index, matches.length, direction);
    setIndex(next);
    selectMatch(matches[next] ?? null);
  }

  function replaceOne() {
    if (!current) return;
    const next = applyReplacement(content, current, replacement, regex, query, caseSensitive);
    const cursor = current.end + (next.length - content.length);
    onReplace(next, { start: current.start, end: cursor });
  }

  function replaceEvery() {
    if (matches.length === 0) return;
    const next = replaceAllMatches(content, matches, replacement, regex, query, caseSensitive);
    onReplace(next, { start: 0, end: 0 });
  }

  if (!open) return null;

  return (
    <div className="find-bar" role="search" aria-label="查找替换">
      <div className="find-bar-row">
        <Input
          id="note-find"
          value={query}
          placeholder="查找"
          aria-label="查找"
          className="h-9 min-w-0 flex-1 text-sm md:text-sm"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              jump(event.shiftKey ? -1 : 1);
            }
            if (event.key === "Escape") {
              event.preventDefault();
              onClose();
            }
          }}
        />
        <span className="find-bar-count tabular-nums" aria-live="polite">
          {error ? error : query ? `${matches.length ? index + 1 : 0}/${matches.length}` : ""}
        </span>
        <Toggle pressed={caseSensitive} label="区分大小写" onClick={() => setCaseSensitive((v) => !v)}>
          Aa
        </Toggle>
        <Toggle pressed={wholeWord} label="全词匹配" onClick={() => setWholeWord((v) => !v)}>
          W
        </Toggle>
        <Toggle pressed={regex} label="正则" onClick={() => setRegex((v) => !v)}>
          .*
        </Toggle>
        <Button variant="ghost" size="icon-sm" aria-label="上一个" onClick={() => jump(-1)}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="下一个" onClick={() => jump(1)}>
          <ChevronDown />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="px-2"
          onClick={() => onReplaceMode(!replaceMode)}
        >
          替换
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="关闭查找" onClick={onClose}>
          <X />
        </Button>
      </div>
      {replaceMode ? (
        <div className="find-bar-row">
          <Input
            id="note-replace"
            value={replacement}
            placeholder="替换为"
            aria-label="替换为"
            className="h-9 min-w-0 flex-1 text-sm md:text-sm"
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                replaceOne();
              }
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <Button variant="subtle" size="sm" disabled={!current} onClick={replaceOne}>
            替换
          </Button>
          <Button variant="subtle" size="sm" disabled={matches.length === 0} onClick={replaceEvery}>
            全部
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function Toggle({
  pressed,
  label,
  onClick,
  children,
}: {
  pressed: boolean;
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "btn-press inline-flex h-8 min-w-8 items-center justify-center rounded-sm px-1.5 font-mono text-xs",
        pressed ? "bg-paper text-fg shadow-border" : "text-muted hover:text-fg",
      )}
    >
      {children}
    </button>
  );
}
