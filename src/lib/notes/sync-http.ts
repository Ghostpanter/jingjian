export function joinUrl(...parts: string[]): string {
  return parts
    .map((part, index) => {
      const value = part.trim();
      if (!value) return "";
      if (index === 0) return value.replace(/\/+$/, "");
      return value.replace(/^\/+/, "").replace(/\/+$/, "");
    })
    .filter(Boolean)
    .join("/");
}

export function basicAuth(user: string, password: string): string {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return `Basic ${btoa(binary)}`;
}

export async function request(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), init.timeoutMs ?? 20_000);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("连接超时");
    }
    throw new Error("无法连接同步服务，请检查地址与网络");
  } finally {
    window.clearTimeout(timer);
  }
}
