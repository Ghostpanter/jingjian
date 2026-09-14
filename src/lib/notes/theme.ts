export type ThemeId =
  | "paper"
  | "ink"
  | "github"
  | "github-dark"
  | "custom-light"
  | "custom-dark";

export type ThemeColors = {
  bg: string;
  fg: string;
  accent: string;
};

export type ThemeConfig = {
  id: ThemeId;
  customLight: ThemeColors;
  customDark: ThemeColors;
};

export type Palette = {
  bg: string;
  surface: string;
  paper: string;
  fg: string;
  ink: string;
  muted: string;
  subtle: string;
  accent: string;
  accentFg: string;
  border: string;
  overlay: string;
  overlayStrong: string;
  ring: string;
  danger: string;
  mark: string;
  syntaxKeyword: string;
  syntaxString: string;
  syntaxNumber: string;
  syntaxFunction: string;
  syntaxComment: string;
};

const STORAGE_KEY = "jingjian.theme.v1";

export const DEFAULT_CUSTOM_LIGHT: ThemeColors = {
  bg: "#f7f3eb",
  fg: "#1a1814",
  accent: "#2c4a42",
};

export const DEFAULT_CUSTOM_DARK: ThemeColors = {
  bg: "#161513",
  fg: "#e8e2d6",
  accent: "#8fafa4",
};

export const DEFAULT_THEME: ThemeConfig = {
  id: "paper",
  customLight: DEFAULT_CUSTOM_LIGHT,
  customDark: DEFAULT_CUSTOM_DARK,
};

export const THEME_OPTIONS: { id: ThemeId; label: string; hint: string }[] = [
  { id: "paper", label: "宣纸", hint: "浅底，代码着色更清楚" },
  { id: "ink", label: "墨夜", hint: "深底，暖字" },
  { id: "github", label: "GitHub", hint: "白底蓝链，Markdown" },
  { id: "github-dark", label: "GitHub 夜间", hint: "深底，代码着色最清楚" },
  { id: "custom-light", label: "自定义白底", hint: "自定纸色 / 字色" },
  { id: "custom-dark", label: "自定义黑底", hint: "自定纸色 / 字色" },
];

const LIGHT_SYNTAX = {
  syntaxKeyword: "#cf222e",
  syntaxString: "#0a3069",
  syntaxNumber: "#0550ae",
  syntaxFunction: "#8250df",
  syntaxComment: "#57606a",
};

const DARK_SYNTAX = {
  syntaxKeyword: "#ff7b72",
  syntaxString: "#a5d6ff",
  syntaxNumber: "#79c0ff",
  syntaxFunction: "#d2a8ff",
  syntaxComment: "#8b949e",
};

const PRESETS: Record<"paper" | "ink" | "github" | "github-dark", Palette> = {
  paper: {
    bg: "#f2ede4",
    surface: "#e8e0d2",
    paper: "#f7f3eb",
    fg: "#1a1814",
    ink: "#1a1814",
    muted: "#6a6358",
    subtle: "#8a8276",
    accent: "#2c4a42",
    accentFg: "#f2ede4",
    border: "#d5cbb8",
    overlay: "#ddd4c4",
    overlayStrong: "#d0c6b4",
    ring: "#2c4a42",
    danger: "#8f3d32",
    mark: "#dfe8d8",
    ...LIGHT_SYNTAX,
    syntaxComment: "#6a6358",
  },
  ink: {
    bg: "#161513",
    surface: "#1e1c19",
    paper: "#1a1816",
    fg: "#e8e2d6",
    ink: "#e8e2d6",
    muted: "#a39a8c",
    subtle: "#7a7368",
    accent: "#8fafa4",
    accentFg: "#161513",
    border: "#2e2a24",
    overlay: "#26231f",
    overlayStrong: "#322e28",
    ring: "#8fafa4",
    danger: "#e08b7a",
    mark: "#2c4038",
    ...DARK_SYNTAX,
    syntaxComment: "#8a8276",
  },
  github: {
    bg: "#ffffff",
    surface: "#f6f8fa",
    paper: "#ffffff",
    fg: "#1f2328",
    ink: "#1f2328",
    muted: "#59636e",
    subtle: "#818b98",
    accent: "#0969da",
    accentFg: "#ffffff",
    border: "#d0d7de",
    overlay: "#f6f8fa",
    overlayStrong: "#eaeef2",
    ring: "#0969da",
    danger: "#d1242f",
    mark: "#fff8c5",
    ...LIGHT_SYNTAX,
  },
  "github-dark": {
    bg: "#0d1117",
    surface: "#161b22",
    paper: "#0d1117",
    fg: "#e6edf3",
    ink: "#e6edf3",
    muted: "#9198a1",
    subtle: "#6e7681",
    accent: "#4493f8",
    accentFg: "#0d1117",
    border: "#30363d",
    overlay: "#21262d",
    overlayStrong: "#2d333b",
    ring: "#4493f8",
    danger: "#f85149",
    mark: "#3a2e00",
    ...DARK_SYNTAX,
  },
};

const VAR_MAP: Record<keyof Palette, string> = {
  bg: "--color-bg",
  surface: "--color-surface",
  paper: "--color-paper",
  fg: "--color-fg",
  ink: "--color-ink",
  muted: "--color-muted",
  subtle: "--color-subtle",
  accent: "--color-accent",
  accentFg: "--color-accent-fg",
  border: "--color-border",
  overlay: "--color-overlay",
  overlayStrong: "--color-overlay-strong",
  ring: "--color-ring",
  danger: "--color-danger",
  mark: "--color-mark",
  syntaxKeyword: "--color-syntax-keyword",
  syntaxString: "--color-syntax-string",
  syntaxNumber: "--color-syntax-number",
  syntaxFunction: "--color-syntax-function",
  syntaxComment: "--color-syntax-comment",
};

export function parseHex(hex: string): [number, number, number] | null {
  const value = hex.trim().replace("#", "");
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    return [
      Number.parseInt(value[0] + value[0], 16),
      Number.parseInt(value[1] + value[1], 16),
      Number.parseInt(value[2] + value[2], 16),
    ];
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16),
    ];
  }
  return null;
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function mix(a: string, b: string, t: number): string {
  const left = parseHex(a);
  const right = parseHex(b);
  if (!left || !right) return a;
  return toHex(
    left[0] + (right[0] - left[0]) * t,
    left[1] + (right[1] - left[1]) * t,
    left[2] + (right[2] - left[2]) * t,
  );
}

export function luminance(hex: string): number {
  const rgb = parseHex(hex);
  if (!rgb) return 0.5;
  const [r, g, b] = rgb.map((channel) => {
    const s = channel / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function isDarkTheme(id: ThemeId): boolean {
  return id === "ink" || id === "github-dark" || id === "custom-dark";
}

export function derivePalette(colors: ThemeColors, dark: boolean): Palette {
  const { bg, fg, accent } = colors;
  const accentFg = luminance(accent) > 0.45 ? "#1a1814" : "#f7f3eb";
  return {
    bg,
    surface: mix(bg, fg, dark ? 0.08 : 0.06),
    paper: mix(bg, fg, dark ? 0.04 : 0.03),
    fg,
    ink: fg,
    muted: mix(fg, bg, dark ? 0.42 : 0.45),
    subtle: mix(fg, bg, dark ? 0.58 : 0.62),
    accent,
    accentFg,
    border: mix(fg, bg, dark ? 0.78 : 0.82),
    overlay: mix(bg, fg, dark ? 0.1 : 0.08),
    overlayStrong: mix(bg, fg, dark ? 0.16 : 0.14),
    ring: accent,
    danger: dark ? "#e08b7a" : "#8f3d32",
    mark: mix(accent, bg, dark ? 0.55 : 0.78),
    ...(dark ? DARK_SYNTAX : LIGHT_SYNTAX),
  };
}

export function paletteFor(config: ThemeConfig): Palette {
  if (config.id === "custom-light") return derivePalette(config.customLight, false);
  if (config.id === "custom-dark") return derivePalette(config.customDark, true);
  return PRESETS[config.id];
}

export function themeSwatch(config: ThemeConfig, id: ThemeId = config.id): ThemeColors {
  if (id === "custom-light") return config.customLight;
  if (id === "custom-dark") return config.customDark;
  const palette = PRESETS[id];
  return { bg: palette.bg, fg: palette.fg, accent: palette.accent };
}

export function isThemeId(value: unknown): value is ThemeId {
  return THEME_OPTIONS.some((item) => item.id === value);
}

function isColors(value: unknown): value is ThemeColors {
  if (!value || typeof value !== "object") return false;
  const colors = value as ThemeColors;
  return (
    typeof colors.bg === "string" &&
    typeof colors.fg === "string" &&
    typeof colors.accent === "string"
  );
}

export function readThemeConfig(): ThemeConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_THEME };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_THEME };
    const parsed = JSON.parse(raw) as Partial<ThemeConfig>;
    return {
      id: isThemeId(parsed.id) ? parsed.id : "paper",
      customLight: isColors(parsed.customLight)
        ? parsed.customLight
        : DEFAULT_CUSTOM_LIGHT,
      customDark: isColors(parsed.customDark)
        ? parsed.customDark
        : DEFAULT_CUSTOM_DARK,
    };
  } catch {
    return { ...DEFAULT_THEME };
  }
}

export function writeThemeConfig(config: ThemeConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function cssVarsFromPalette(palette: Palette): string {
  return Object.entries(VAR_MAP)
    .map(([key, name]) => `${name}: ${palette[key as keyof Palette]};`)
    .join(" ");
}

export function applyTheme(config: ThemeConfig): Palette {
  const palette = paletteFor(config);
  if (typeof document === "undefined") return palette;
  const root = document.documentElement;
  root.dataset.theme = config.id;
  root.style.colorScheme = isDarkTheme(config.id) ? "dark" : "light";
  for (const [key, name] of Object.entries(VAR_MAP)) {
    root.style.setProperty(name, palette[key as keyof Palette]);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", palette.bg);
  const scheme = document.querySelector('meta[name="color-scheme"]');
  scheme?.setAttribute("content", isDarkTheme(config.id) ? "dark" : "light");
  void syncNativeChrome(palette, isDarkTheme(config.id));
  return palette;
}

export function statusBarStyleFor(dark: boolean): "DARK" | "LIGHT" {
  // Capacitor: DARK = light glyphs on a dark ground; LIGHT = dark glyphs on a light ground.
  return dark ? "DARK" : "LIGHT";
}

async function syncNativeChrome(palette: Palette, dark: boolean) {
  try {
    const { Capacitor } = await import("@capacitor/core");
    if (!Capacitor.isNativePlatform()) return;
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    try {
      await StatusBar.setBackgroundColor({ color: "#00000000" });
    } catch {
      await StatusBar.setBackgroundColor({ color: palette.bg });
    }
  } catch {
    // Web, desktop, or plugin missing.
  }
}
