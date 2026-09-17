const PAPER_BG = "#f2ede4";
const PAPER_FG = "#1a1814";
const PAPER_SURFACE = "#e8e0d2";
const PAPER_PAPER = "#f7f3eb";

export type BootChrome = {
  bg: string;
  fg: string;
  paper: string;
  surface: string;
  dark: boolean;
};

const FALLBACK: BootChrome = {
  bg: PAPER_BG,
  fg: PAPER_FG,
  paper: PAPER_PAPER,
  surface: PAPER_SURFACE,
  dark: false,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function hex(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return /^#[0-9a-fA-F]{6}$/.test(trimmed) ? trimmed : fallback;
}

export function chromeFromStoredChrome(raw: string | null): BootChrome | null {
  if (!raw) return null;
  try {
    const parsed = asRecord(JSON.parse(raw));
    if (!parsed) return null;
    const bg = hex(parsed.bg, "");
    if (!bg) return null;
    const dark = parsed.dark === true;
    const fg = hex(parsed.fg, dark ? "#e8e2d6" : PAPER_FG);
    return {
      bg,
      fg,
      paper: hex(parsed.paper, bg),
      surface: hex(parsed.surface, bg),
      dark,
    };
  } catch {
    return null;
  }
}

export function chromeFromStoredTheme(raw: string | null): BootChrome {
  if (!raw) return { ...FALLBACK };
  try {
    const parsed = asRecord(JSON.parse(raw));
    if (!parsed) return { ...FALLBACK };
    const id = typeof parsed.id === "string" ? parsed.id : "paper";
    const customLight = asRecord(parsed.customLight);
    const customDark = asRecord(parsed.customDark);
    if (id === "ink") {
      return { bg: "#161513", fg: "#e8e2d6", paper: "#1a1816", surface: "#1e1c19", dark: true };
    }
    if (id === "github") {
      return { bg: "#ffffff", fg: "#1f2328", paper: "#ffffff", surface: "#f6f8fa", dark: false };
    }
    if (id === "github-dark") {
      return { bg: "#0d1117", fg: "#e6edf3", paper: "#0d1117", surface: "#161b22", dark: true };
    }
    if (id === "custom-light") {
      const bg = hex(customLight?.bg, PAPER_BG);
      const fg = hex(customLight?.fg, PAPER_FG);
      return { bg, fg, paper: bg, surface: bg, dark: false };
    }
    if (id === "custom-dark") {
      const bg = hex(customDark?.bg, "#161513");
      const fg = hex(customDark?.fg, "#e8e2d6");
      return { bg, fg, paper: bg, surface: bg, dark: true };
    }
    return { ...FALLBACK };
  } catch {
    return { ...FALLBACK };
  }
}

export function applyBootChrome(chrome: BootChrome) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.colorScheme = chrome.dark ? "dark" : "light";
  root.style.setProperty("--color-bg", chrome.bg);
  root.style.setProperty("--color-paper", chrome.paper);
  root.style.setProperty("--color-surface", chrome.surface);
  root.style.setProperty("--color-fg", chrome.fg);
  root.style.background = chrome.bg;
  root.style.backgroundColor = chrome.bg;
  root.style.color = chrome.fg;
  if (document.body) {
    document.body.style.background = chrome.bg;
    document.body.style.color = chrome.fg;
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", chrome.bg);
  const scheme = document.querySelector('meta[name="color-scheme"]');
  scheme?.setAttribute("content", chrome.dark ? "dark" : "light");
}

export function bootThemeFromStorage(): BootChrome {
  const read = (key: string) =>
    typeof localStorage === "undefined" ? null : localStorage.getItem(key);
  const chrome =
    chromeFromStoredChrome(read("jingjian.chrome.v1")) ??
    chromeFromStoredTheme(read("jingjian.theme.v1"));
  applyBootChrome(chrome);
  return chrome;
}

/** Inline head script: paints the last theme before CSS/JS, so launch has no color jump. */
export const THEME_BOOT_SCRIPT = `"use strict";(function(){try{var bg="#f2ede4",fg="#1a1814",paper="#f7f3eb",surface="#e8e0d2",dark=false,used=false;var chRaw=localStorage.getItem("jingjian.chrome.v1");if(chRaw){var ch=JSON.parse(chRaw);if(ch&&typeof ch.bg==="string"&&/^#[0-9a-fA-F]{6}$/.test(ch.bg)){bg=ch.bg;dark=!!ch.dark;fg=typeof ch.fg==="string"&&/^#[0-9a-fA-F]{6}$/.test(ch.fg)?ch.fg:(dark?"#e8e2d6":fg);paper=bg;surface=bg;used=true;}}if(!used){var raw=localStorage.getItem("jingjian.theme.v1");if(raw){var c=JSON.parse(raw);var id=c&&c.id||"paper";if(id==="ink"){bg="#161513";fg="#e8e2d6";paper="#1a1816";surface="#1e1c19";dark=true;}else if(id==="github"){bg="#ffffff";fg="#1f2328";paper="#ffffff";surface="#f6f8fa";}else if(id==="github-dark"){bg="#0d1117";fg="#e6edf3";paper="#0d1117";surface="#161b22";dark=true;}else if(id==="custom-light"&&c.customLight&&/^#[0-9a-fA-F]{6}$/.test(c.customLight.bg)){bg=c.customLight.bg;fg=c.customLight.fg||fg;paper=bg;surface=bg;}else if(id==="custom-dark"&&c.customDark&&/^#[0-9a-fA-F]{6}$/.test(c.customDark.bg)){bg=c.customDark.bg;fg=c.customDark.fg||"#e8e2d6";paper=bg;surface=bg;dark=true;}}}var r=document.documentElement;r.style.colorScheme=dark?"dark":"light";r.style.setProperty("--color-bg",bg);r.style.setProperty("--color-paper",paper);r.style.setProperty("--color-surface",surface);r.style.setProperty("--color-fg",fg);r.style.background=bg;r.style.backgroundColor=bg;r.style.color=fg;if(document.body){document.body.style.background=bg;document.body.style.color=fg;}var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",bg);var s=document.querySelector('meta[name="color-scheme"]');if(s)s.setAttribute("content",dark?"dark":"light");}catch(e){}})();`;
