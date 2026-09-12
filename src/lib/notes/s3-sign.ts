import { toArrayBuffer } from "./bytes.ts";

const encoder = new TextEncoder();

export function rfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => {
    return `%${char.charCodeAt(0).toString(16).toUpperCase()}`;
  });
}

export function encodeS3Path(key: string): string {
  return key
    .split("/")
    .map((part) => rfc3986(part))
    .join("/");
}

export function canonicalUri(pathname: string): string {
  const decoded = decodeURIComponent(pathname || "/");
  const trimmed = decoded.replace(/^\/+/, "");
  return `/${encodeS3Path(trimmed)}`;
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function asBuffer(value: ArrayBuffer | Uint8Array): ArrayBuffer {
  return value instanceof Uint8Array ? toArrayBuffer(value) : value;
}

export async function sha256Hex(data: string | ArrayBuffer | Uint8Array): Promise<string> {
  const bytes =
    typeof data === "string"
      ? encoder.encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return hex(new Uint8Array(hash));
}

export async function hmacRaw(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    asBuffer(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign("HMAC", cryptoKey, toArrayBuffer(encoder.encode(data)));
}

export async function hmacHex(
  key: ArrayBuffer | Uint8Array,
  data: string,
): Promise<string> {
  return hex(new Uint8Array(await hmacRaw(key, data)));
}

export async function signingKey(
  secret: string,
  dateStamp: string,
  region: string,
  service = "s3",
): Promise<ArrayBuffer> {
  const kDate = await hmacRaw(encoder.encode(`AWS4${secret}`), dateStamp);
  const kRegion = await hmacRaw(kDate, region);
  const kService = await hmacRaw(kRegion, service);
  return hmacRaw(kService, "aws4_request");
}

export function amzDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export type S3SignInput = {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | Uint8Array | null;
  accessKey: string;
  secretKey: string;
  region: string;
  service?: string;
  now?: Date;
};

export async function signS3Request(input: S3SignInput): Promise<{
  url: string;
  headers: Record<string, string>;
  payloadHash: string;
}> {
  const parsed = new URL(input.url);
  const method = input.method.toUpperCase();
  const now = input.now ?? new Date();
  const timestamp = amzDate(now);
  const dateStamp = timestamp.slice(0, 8);
  const service = input.service ?? "s3";
  const region = input.region.trim() || "us-east-1";

  let payloadHash: string;
  if (input.body == null) {
    payloadHash = await sha256Hex("");
  } else if (typeof input.body === "string") {
    payloadHash = await sha256Hex(input.body);
  } else {
    payloadHash = await sha256Hex(input.body);
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.headers ?? {})) {
    headers[key.toLowerCase()] = value.trim();
  }
  headers.host = parsed.host;
  headers["x-amz-date"] = timestamp;
  headers["x-amz-content-sha256"] = payloadHash;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name].replace(/\s+/g, " ")}`)
    .join("\n");
  const signedHeaders = signedHeaderNames.join(";");

  const query = [...parsed.searchParams.entries()].sort(([left], [right]) =>
    left < right ? -1 : left > right ? 1 : 0,
  );
  const canonicalQuery = query
    .map(([key, value]) => `${rfc3986(key)}=${rfc3986(value)}`)
    .join("&");

  const canonicalRequest = [
    method,
    canonicalUri(parsed.pathname),
    canonicalQuery,
    `${canonicalHeaders}\n`,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const key = await signingKey(input.secretKey, dateStamp, region, service);
  const signature = await hmacHex(key, stringToSign);

  headers.authorization = `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return { url: input.url, headers, payloadHash };
}
