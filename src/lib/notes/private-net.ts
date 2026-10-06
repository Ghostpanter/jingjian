const ASKED_KEY = "jingjian.lan.asked.v1";

/** True for LAN hosts. Localhost is not included — Android does not need the permission for it. */
export function isPrivateNetworkHost(input: string): boolean {
  const raw = input.trim();
  if (!raw) return false;
  let host = raw;
  try {
    const withProto = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `http://${raw}`;
    host = new URL(withProto).hostname;
  } catch {
    host = raw.split("/")[0]?.split("@").pop() ?? raw;
    host = host.split(":")[0] ?? host;
  }
  host = host.replace(/^\[|\]$/g, "").toLowerCase().replace(/\.$/, "");
  if (!host || host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") {
    return false;
  }
  if (host.endsWith(".local") || host.endsWith(".lan")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if ([a, b, Number(v4[3]), Number(v4[4])].some((part) => part > 255)) return false;
    if (a === 10) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true;
    return false;
  }
  if (host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80")) return true;
  return false;
}

export function readLanAsked(): boolean {
  try {
    return localStorage.getItem(ASKED_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeLanAsked() {
  try {
    localStorage.setItem(ASKED_KEY, "1");
  } catch {
    // private mode
  }
}
