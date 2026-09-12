import { filenameForNote, isNoteFilename, parseNoteFile, serializeNote } from "./markdown-file.ts";
import { encodeS3Path, rfc3986, signS3Request } from "./s3-sign.ts";
import { request } from "./sync-http.ts";
import type { OssVendor, SyncAdapter, SyncConfig } from "./sync-types.ts";
import type { Note } from "./types.ts";

export type { OssVendor };

export const OSS_VENDORS: {
  id: OssVendor;
  label: string;
  hint: string;
  region: string;
  pathStyle: boolean;
}[] = [
  { id: "aliyun", label: "阿里云 OSS", hint: "对象存储", region: "cn-hangzhou", pathStyle: false },
  { id: "tencent", label: "腾讯云 COS", hint: "对象存储", region: "ap-guangzhou", pathStyle: false },
  { id: "huawei", label: "华为云 OBS", hint: "对象存储", region: "cn-north-4", pathStyle: false },
  { id: "qiniu", label: "七牛云 Kodo", hint: "S3 兼容", region: "cn-east-1", pathStyle: true },
  { id: "volcengine", label: "火山引擎 TOS", hint: "对象存储", region: "cn-beijing", pathStyle: false },
  { id: "aws", label: "Amazon S3", hint: "国际", region: "us-east-1", pathStyle: false },
  { id: "minio", label: "MinIO / 自定义", hint: "S3 兼容", region: "us-east-1", pathStyle: true },
];

export function isOssVendor(value: unknown): value is OssVendor {
  return OSS_VENDORS.some((item) => item.id === value);
}

export function endpointForVendor(vendor: OssVendor, region: string): string {
  const r = region.trim();
  switch (vendor) {
    case "aliyun":
      return `oss-${r || "cn-hangzhou"}.aliyuncs.com`;
    case "tencent":
      return `cos.${r || "ap-guangzhou"}.myqcloud.com`;
    case "huawei":
      return `obs.${r || "cn-north-4"}.myhuaweicloud.com`;
    case "qiniu":
      return `s3.${r || "cn-east-1"}.qiniucs.com`;
    case "volcengine":
      return `tos-${r || "cn-beijing"}.volces.com`;
    case "aws":
      return !r || r === "us-east-1" ? "s3.amazonaws.com" : `s3.${r}.amazonaws.com`;
    default:
      return "";
  }
}

export function patchOssVendor(
  vendor: OssVendor,
  current: Pick<SyncConfig, "ossRegion" | "ossEndpoint">,
): Pick<SyncConfig, "ossVendor" | "ossRegion" | "ossEndpoint" | "ossPathStyle"> {
  const preset = OSS_VENDORS.find((item) => item.id === vendor) ?? OSS_VENDORS[0];
  return {
    ossVendor: vendor,
    ossRegion: vendor === "minio" ? current.ossRegion || preset.region : preset.region,
    ossEndpoint:
      vendor === "minio"
        ? current.ossEndpoint
        : endpointForVendor(vendor, preset.region),
    ossPathStyle: preset.pathStyle,
  };
}

function normalizeEndpoint(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("请填写 Endpoint");
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

export function ossUsesPathStyle(config: SyncConfig): boolean {
  if (config.ossPathStyle) return true;
  try {
    const host = new URL(normalizeEndpoint(config.ossEndpoint)).hostname;
    return host === "localhost" || host.startsWith("127.") || host.endsWith(".local");
  } catch {
    return true;
  }
}

export function ossBucketUrl(config: SyncConfig): string {
  const bucket = config.ossBucket.trim();
  if (!bucket) throw new Error("请填写 Bucket 名称");
  const endpoint = normalizeEndpoint(config.ossEndpoint);
  if (ossUsesPathStyle(config)) return `${endpoint}/${bucket}`;
  const url = new URL(endpoint);
  return `${url.protocol}//${bucket}.${url.host}`;
}

export function ossObjectKey(config: SyncConfig, filename: string): string {
  const prefix = config.ossPrefix.trim().replace(/^\/+|\/+$/g, "");
  return prefix ? `${prefix}/${filename}` : filename;
}

export function ossObjectUrl(config: SyncConfig, key: string): string {
  return `${ossBucketUrl(config)}/${encodeS3Path(key)}`;
}

export function parseListKeys(xml: string): { keys: string[]; token: string | null } {
  const keys: string[] = [];
  for (const match of xml.matchAll(/<Key>([^<]+)<\/Key>/gi)) {
    keys.push(decodeXml(match[1].trim()));
  }
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml);
  const tokenMatch = xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/i);
  return {
    keys,
    token: truncated && tokenMatch ? decodeXml(tokenMatch[1].trim()) : null,
  };
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function s3Query(params: Record<string, string>): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${rfc3986(key)}=${rfc3986(params[key] ?? "")}`)
    .join("&");
}

function statusError(status: number, action: string): Error {
  if (status === 403) return new Error(`${action}被拒绝，请检查 AccessKey 与桶权限`);
  if (status === 404) return new Error("找不到 Bucket，请核对名称与地域");
  return new Error(`${action}失败（${status}）`);
}

async function signedRequest(
  config: SyncConfig,
  method: string,
  url: string,
  body?: string,
): Promise<Response> {
  const accessKey = config.ossAccessKey.trim();
  const secretKey = config.ossSecretKey.trim();
  if (!accessKey || !secretKey) throw new Error("请填写 AccessKey 与 SecretKey");
  const signed = await signS3Request({
    method,
    url,
    body: body ?? null,
    accessKey,
    secretKey,
    region: config.ossRegion.trim() || "us-east-1",
    headers: body
      ? { "content-type": "text/markdown; charset=utf-8" }
      : undefined,
  });
  const headers = new Headers();
  for (const [key, value] of Object.entries(signed.headers)) {
    if (key === "host") continue;
    headers.set(key, value);
  }
  try {
    return await request(url, { method, headers, body });
  } catch (error) {
    const message = error instanceof Error ? error.message : "无法连接存储桶";
    if (message.includes("无法连接")) {
      throw new Error(
        "无法连接存储桶。网页需在桶 CORS 放行当前站点；安卓与电脑应用可直连。",
      );
    }
    throw error;
  }
}

async function listKeys(config: SyncConfig): Promise<string[]> {
  const prefix = config.ossPrefix.trim().replace(/^\/+|\/+$/g, "");
  const found: string[] = [];
  let token: string | null = null;
  do {
    const params: Record<string, string> = { "list-type": "2", "max-keys": "1000" };
    if (prefix) params.prefix = `${prefix}/`;
    if (token) params["continuation-token"] = token;
    const url = `${ossBucketUrl(config)}?${s3Query(params)}`;
    const response = await signedRequest(config, "GET", url);
    if (!response.ok) throw statusError(response.status, "列出对象");
    const parsed = parseListKeys(await response.text());
    found.push(...parsed.keys);
    token = parsed.token;
  } while (token);
  return found.filter((key) => isNoteFilename(key.split("/").pop() || ""));
}

export function createOssAdapter(config: SyncConfig): SyncAdapter {
  const vendor =
    OSS_VENDORS.find((item) => item.id === config.ossVendor)?.label ?? "对象存储";
  return {
    async test() {
      const params: Record<string, string> = { "list-type": "2", "max-keys": "1" };
      const prefix = config.ossPrefix.trim().replace(/^\/+|\/+$/g, "");
      if (prefix) params.prefix = `${prefix}/`;
      const response = await signedRequest(
        config,
        "GET",
        `${ossBucketUrl(config)}?${s3Query(params)}`,
      );
      if (!response.ok) throw statusError(response.status, "连接");
      return `${vendor} 桶 ${config.ossBucket.trim()} 可用`;
    },
    async list() {
      const keys = await listKeys(config);
      const notes: Note[] = [];
      for (const key of keys) {
        const response = await signedRequest(config, "GET", ossObjectUrl(config, key));
        if (!response.ok) continue;
        const raw = await response.text();
        const file = key.split("/").pop() || key;
        notes.push(parseNoteFile(raw, file.replace(/\.(md|markdown|txt)$/i, "")));
      }
      return notes;
    },
    async upsert(note) {
      const key = ossObjectKey(config, filenameForNote(note));
      const response = await signedRequest(
        config,
        "PUT",
        ossObjectUrl(config, key),
        serializeNote(note),
      );
      if (!response.ok && response.status !== 201 && response.status !== 204) {
        throw statusError(response.status, "上传");
      }
    },
    async remove(id) {
      const keys = await listKeys(config);
      const short = id.replace(/-/g, "").slice(0, 8);
      for (const key of keys) {
        if (!key.replace(/-/g, "").includes(short)) continue;
        await signedRequest(config, "DELETE", ossObjectUrl(config, key));
      }
    },
  };
}
