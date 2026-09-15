import type { LaunchFile, OpenUriFile } from "./native-folder.ts";

export type DesktopFolderStatus = {
  ok: boolean;
  name: string;
  path: string;
};

export type DesktopNetResult = {
  ok: boolean;
  status: number;
  headers: Record<string, string>;
  bodyText: string;
  bodyBase64: string;
};

export type DesktopApi = {
  pickSavePath?(options: { filename: string; mime: string }): Promise<string>;
  writeFile?(options: {
    filePath: string;
    base64: string;
    mime: string;
  }): Promise<string>;
  saveFile?(options: {
    filename: string;
    base64: string;
    mime: string;
  }): Promise<string>;
  pickFolder(): Promise<{ name: string; path: string }>;
  pickImportFolder(): Promise<{
    name: string;
    files: Array<{ name: string; relativePath: string; content: string }>;
  }>;
  folderStatus(): Promise<DesktopFolderStatus>;
  folderList(): Promise<{ files: Array<{ name: string; content: string }> }>;
  folderWrite(options: { name: string; content: string; shortId: string }): Promise<void>;
  folderRemove(options: { shortId: string }): Promise<void>;
  libraryEnsure(): Promise<{ path: string }>;
  libraryMkdir(options: { relative: string }): Promise<{ path: string }>;
  libraryRmdir(options: { relative: string }): Promise<void>;
  libraryWrite(options: { relative: string; content: string }): Promise<{ path: string }>;
  libraryRemove?(options: { relative: string }): Promise<void>;
  consumeLaunchFile(): Promise<LaunchFile>;
  readOpenFile(options: { path: string; name?: string }): Promise<OpenUriFile>;
  onOpenFile(callback: (file: LaunchFile) => void): () => void;
  netFetch(options: {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string | null;
    timeoutMs?: number;
  }): Promise<DesktopNetResult>;
};

export function desktopApi(): DesktopApi | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as Window & { jingjianDesktop?: DesktopApi }).jingjianDesktop;
}

export function isDesktopApp(): boolean {
  return Boolean(desktopApi());
}

function headersToRecord(headers: HeadersInit | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!headers) return out;
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      out[key] = value;
    });
    return out;
  }
  if (Array.isArray(headers)) {
    for (const [key, value] of headers) out[key] = value;
    return out;
  }
  return { ...headers };
}

export async function desktopRequest(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const api = desktopApi();
  if (!api?.netFetch) throw new Error("桌面网络不可用");
  const body =
    typeof init.body === "string"
      ? init.body
      : init.body == null
        ? null
        : String(init.body);
  const result = await api.netFetch({
    url,
    method: init.method,
    headers: headersToRecord(init.headers),
    body,
    timeoutMs: init.timeoutMs,
  });
  return new Response(result.bodyText, {
    status: result.status,
    headers: result.headers,
  });
}
