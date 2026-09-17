export type EditorFont = "serif" | "sans" | "mono";
export type EditorSize = "sm" | "md" | "lg" | "xl";

export type EditorPrefs = {
  font: EditorFont;
  size: EditorSize;
};

const STORAGE_KEY = "jingjian.editor.v1";

export const DEFAULT_EDITOR_PREFS: EditorPrefs = {
  font: "serif",
  size: "md",
};

export const EDITOR_FONTS: { id: EditorFont; label: string }[] = [
  { id: "serif", label: "宋体" },
  { id: "sans", label: "黑体" },
  { id: "mono", label: "等宽" },
];

export const EDITOR_SIZES: { id: EditorSize; label: string; value: string }[] = [
  { id: "sm", label: "小", value: "1rem" },
  { id: "md", label: "中", value: "1.125rem" },
  { id: "lg", label: "大", value: "1.25rem" },
  { id: "xl", label: "特大", value: "1.375rem" },
];

const FONTS: EditorFont[] = ["serif", "sans", "mono"];
const SIZES: EditorSize[] = ["sm", "md", "lg", "xl"];

export function readEditorPrefs(): EditorPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_EDITOR_PREFS };
    const parsed = JSON.parse(raw) as Partial<EditorPrefs>;
    return {
      font: FONTS.includes(parsed.font as EditorFont) ? (parsed.font as EditorFont) : "serif",
      size: SIZES.includes(parsed.size as EditorSize) ? (parsed.size as EditorSize) : "md",
    };
  } catch {
    return { ...DEFAULT_EDITOR_PREFS };
  }
}

export function writeEditorPrefs(prefs: EditorPrefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // private mode
  }
}

export function applyEditorPrefs(prefs: EditorPrefs = readEditorPrefs()) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const size = EDITOR_SIZES.find((item) => item.id === prefs.size)?.value ?? "1.125rem";
  const font =
    prefs.font === "sans"
      ? "var(--font-sans)"
      : prefs.font === "mono"
        ? "var(--font-mono)"
        : "var(--font-serif)";
  root.style.setProperty("--editor-size", size);
  root.style.setProperty("--editor-font", font);
}
