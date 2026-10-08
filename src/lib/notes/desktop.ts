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
    bodyBase64?: string | null;
    timeoutMs?: number;
  }): Promise<DesktopNetResult>;
  setChrome?(options: { bg: string; dark: boolean }): Promise<void> | void;
  printHtml?(options: {
    html: string;
    jobName?: string;
  }): Promise<{ cancelled?: boolean } | void>;
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

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) out[index] = binary.charCodeAt(index);
  return out;
}

export async function desktopBodyFields(
  body: BodyInit | null | undefined,
): Promise<{ body: string | null; bodyBase64: string | null }> {
  if (body == null) return { body: null, bodyBase64: null };
  if (typeof body === "string") return { body, bodyBase64: null };
  if (body instanceof URLSearchParams) return { body: body.toString(), bodyBase64: null };
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return { body: null, bodyBase64: bytesToBase64(new Uint8Array(await body.arrayBuffer())) };
  }
  if (body instanceof ArrayBuffer) {
    return { body: null, bodyBase64: bytesToBase64(new Uint8Array(body)) };
  }
  if (ArrayBuffer.isView(body)) {
    return {
      body: null,
      bodyBase64: bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength)),
    };
  }
  return { body: String(body), bodyBase64: null };
}

export async function desktopRequest(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const api = desktopApi();
  if (!api?.netFetch) throw new Error("桌面网络不可用");
  const fields = await desktopBodyFields(init.body);
  const result = await api.netFetch({
    url,
    method: init.method,
    headers: headersToRecord(init.headers),
    body: fields.body,
    bodyBase64: fields.bodyBase64,
    timeoutMs: init.timeoutMs,
  });
  const bytes = result.bodyBase64 ? base64ToBytes(result.bodyBase64) : null;
  let body: BodyInit = result.bodyText;
  if (bytes) {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    body = new Blob([copy]);
  }
  return new Response(body, {
    status: result.status,
    headers: result.headers,
  });
}
