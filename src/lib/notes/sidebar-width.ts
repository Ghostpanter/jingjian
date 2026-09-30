export const SIDEBAR_WIDTH_KEY = "jingjian.sidebar.width.v1";
export const SIDEBAR_MIN = 200;
export const SIDEBAR_MAX = 480;
/** Drag past this and the sidebar closes instead of staying a sliver. */
export const SIDEBAR_COLLAPSE_AT = 160;

export function sidebarWidthMax(viewport: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.floor(viewport * 0.55)));
}

export function clampSidebarWidth(width: number, viewport = 1280): number {
  const max = sidebarWidthMax(viewport);
  return Math.min(max, Math.max(SIDEBAR_MIN, Math.round(width)));
}

export function shouldCollapseSidebar(width: number): boolean {
  return width < SIDEBAR_COLLAPSE_AT;
}

export function readSidebarWidth(): number | null {
  try {
    const raw = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (!raw) return null;
    const width = Number(raw);
    if (!Number.isFinite(width)) return null;
    return clampSidebarWidth(width);
  } catch {
    return null;
  }
}

export function writeSidebarWidth(width: number) {
  try {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(Math.round(width)));
  } catch {
    // private mode
  }
}
