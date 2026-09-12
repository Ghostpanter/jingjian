export function looksLikeUrl(value: string): boolean {
  const trimmed = value.trim();
  return /^(https?:\/\/|mailto:|www\.)/i.test(trimmed);
}

export function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^www\./i.test(trimmed)) return `https://${trimmed}`;
  if (
    /^https?:\/\//i.test(trimmed) ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    return trimmed;
  }
  if (/^[a-z0-9.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

export function wrapAsMarkup(
  value: string,
  start: number,
  end: number,
  text: string,
  href: string,
  image: boolean,
): { value: string; cursor: number } {
  const inner = text || href;
  const snippet = image ? `![${inner}](${href})` : `[${inner}](${href})`;
  return {
    value: value.slice(0, start) + snippet + value.slice(end),
    cursor: start + snippet.length,
  };
}

export function readEditorSelection(): {
  value: string;
  start: number;
  end: number;
  selected: string;
} | null {
  const el = document.getElementById("note-editor");
  if (!(el instanceof HTMLTextAreaElement)) return null;
  return {
    value: el.value,
    start: el.selectionStart,
    end: el.selectionEnd,
    selected: el.value.slice(el.selectionStart, el.selectionEnd),
  };
}

export function writeEditorValue(
  next: string,
  cursor: number,
  onChange: (value: string) => void,
): void {
  const el = document.getElementById("note-editor");
  if (el instanceof HTMLTextAreaElement) {
    el.value = next;
    onChange(next);
    const position = Math.max(0, Math.min(cursor, next.length));
    requestAnimationFrame(() => el.setSelectionRange(position, position));
    return;
  }
  onChange(next);
}
