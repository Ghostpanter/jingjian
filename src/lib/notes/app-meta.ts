export const APP_META = {
  name: "静笺",
  tagline: "本地 Markdown 笔记",
  version: "1.7.4",
  releasedAt: "2026-09-20",
  license: "MIT",
  copyrightYear: 2026,
  author: "Ghostpanter",
  repoUrl: "https://github.com/Ghostpanter/jingjian",
  releasesUrl: "https://github.com/Ghostpanter/jingjian/releases",
  latestApiUrl: "https://api.github.com/repos/Ghostpanter/jingjian/releases/latest",
  issuesUrl: "https://github.com/Ghostpanter/jingjian/issues",
  licenseUrl: "https://github.com/Ghostpanter/jingjian/blob/main/LICENSE",
  donateUrl: "https://github.com/sponsors/Ghostpanter",
  donateLabel: "GitHub Sponsors",
} as const;

export const MIT_LICENSE = `MIT License

Copyright (c) 2026 Ghostpanter

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.`;

export function stripVTag(tag: string): string {
  return tag.trim().replace(/^v/i, "");
}

export function compareSemver(a: string, b: string): number {
  const left = stripVTag(a).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const right = stripVTag(b).split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const delta = (left[index] ?? 0) - (right[index] ?? 0);
    if (delta !== 0) return delta > 0 ? 1 : -1;
  }
  return 0;
}

export function formatReleasedAt(isoDate: string): string {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return isoDate;
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日`;
}

export function versionLine(): string {
  return `${APP_META.name} ${APP_META.version}（${APP_META.releasedAt}）${APP_META.license} · ${APP_META.repoUrl}`;
}

export function parseLatestRelease(raw: unknown): { version: string; url: string } {
  if (!raw || typeof raw !== "object") throw new Error("无法检查更新");
  const data = raw as { tag_name?: unknown; html_url?: unknown };
  const version = stripVTag(typeof data.tag_name === "string" ? data.tag_name : "");
  if (!version) throw new Error("无法检查更新");
  const url =
    typeof data.html_url === "string" && data.html_url.startsWith("https://")
      ? data.html_url
      : APP_META.releasesUrl;
  return { version, url };
}

export function hasNewerRelease(current: string, latest: string): boolean {
  return compareSemver(latest, current) > 0;
}
