import type { ImageConfig } from "./image-config";

function joinPath(...parts: string[]): string {
  return parts
    .map((part) => part.replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
}

function readPath(payload: unknown, path: string): unknown {
  if (!path.trim()) return payload;
  return path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean)
    .reduce<unknown>((current, key) => {
      if (current == null) return undefined;
      if (Array.isArray(current)) return current[Number(key)];
      if (typeof current === "object") {
        return (current as Record<string, unknown>)[key];
      }
      return undefined;
    }, payload);
}

function pickUrl(payload: unknown, path: string): string {
  const candidates = [
    readPath(payload, path),
    readPath(payload, "url"),
    readPath(payload, "data.url"),
    readPath(payload, "data.link"),
    readPath(payload, "data.links.url"),
    readPath(payload, "result.0"),
    readPath(payload, "result"),
  ];
  for (const value of candidates) {
    if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
    if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  }
  throw new Error("图床没有返回图片地址");
}

async function toBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return btoa(binary);
}

function githubParts(repo: string): { owner: string; name: string } {
  const [owner, name] = repo
    .trim()
    .replace(/^https?:\/\/(github|gitee)\.com\//i, "")
    .split("/");
  if (!owner || !name) throw new Error("仓库写成 owner/repo");
  return { owner, name: name.replace(/\.git$/, "") };
}

function datedName(filename: string, folder: string): string {
  const ext = filename.split(".").pop() || "jpg";
  const now = new Date();
  const month = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
  const safe = filename.replace(/[^\w.\u4e00-\u9fff-]+/g, "_") || `image.${ext}`;
  return joinPath(folder || "jingjian", month, `${now.getTime()}-${safe}`);
}

async function uploadGithub(
  config: ImageConfig,
  blob: Blob,
  filename: string,
): Promise<string> {
  const { owner, name } = githubParts(config.githubRepo);
  const remote = datedName(filename, config.githubPath);
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}/contents/${remote}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${config.githubToken.trim()}`,
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: `jingjian: ${filename}`,
        content: await toBase64(blob),
        branch: config.githubBranch.trim() || "main",
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`GitHub 上传失败（${response.status}）`);
  }
  const branch = config.githubBranch.trim() || "main";
  if (config.githubLink === "custom" && config.githubDomain.trim()) {
    return `${config.githubDomain.trim().replace(/\/+$/, "")}/${remote}`;
  }
  if (config.githubLink === "raw") {
    return `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${remote}`;
  }
  return `https://cdn.jsdelivr.net/gh/${owner}/${name}@${branch}/${remote}`;
}

async function uploadGitee(
  config: ImageConfig,
  blob: Blob,
  filename: string,
): Promise<string> {
  const { owner, name } = githubParts(config.giteeRepo);
  const remote = datedName(filename, config.giteePath);
  const branch = config.giteeBranch.trim() || "master";
  const body = new URLSearchParams({
    access_token: config.giteeToken.trim(),
    content: await toBase64(blob),
    message: `jingjian: ${filename}`,
    branch,
  });
  const response = await fetch(
    `https://gitee.com/api/v5/repos/${owner}/${name}/contents/${encodeURI(remote)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );
  if (!response.ok) {
    throw new Error(`Gitee 上传失败（${response.status}）`);
  }
  return `https://gitee.com/${owner}/${name}/raw/${branch}/${remote}`;
}

async function uploadForm(
  url: string,
  blob: Blob,
  filename: string,
  field: string,
  headers: Record<string, string>,
  path: string,
): Promise<string> {
  const body = new FormData();
  body.append(field, blob, filename);
  const response = await fetch(url, { method: "POST", headers, body });
  if (!response.ok) throw new Error(`图床返回 ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return pickUrl(await response.json(), path);
  }
  const text = (await response.text()).trim();
  if (/^https?:\/\//i.test(text)) return text;
  throw new Error("图床返回无法解析");
}

export async function uploadImage(
  config: ImageConfig,
  blob: Blob,
  filename: string,
): Promise<string> {
  if (config.uploader === "none") {
    throw new Error("还没有选择上传服务");
  }
  if (config.uploader === "github") {
    if (!config.githubToken.trim() || !config.githubRepo.trim()) {
      throw new Error("请填写 GitHub Token 和仓库");
    }
    return uploadGithub(config, blob, filename);
  }
  if (config.uploader === "gitee") {
    if (!config.giteeToken.trim() || !config.giteeRepo.trim()) {
      throw new Error("请填写 Gitee Token 和仓库");
    }
    return uploadGitee(config, blob, filename);
  }
  if (config.uploader === "smms") {
    if (!config.smmsToken.trim()) throw new Error("请填写 SM.MS Token");
    return uploadForm(
      "https://sm.ms/api/v2/upload",
      blob,
      filename,
      "smfile",
      { Authorization: config.smmsToken.trim() },
      "data.url",
    );
  }
  if (config.uploader === "lsky") {
    if (!config.lskyUrl.trim() || !config.lskyToken.trim()) {
      throw new Error("请填写兰空图床地址和 Token");
    }
    const base = config.lskyUrl.trim().replace(/\/+$/, "");
    return uploadForm(
      `${base}/api/v1/upload`,
      blob,
      filename,
      "file",
      { Authorization: `Bearer ${config.lskyToken.trim()}` },
      "data.links.url",
    );
  }
  if (config.uploader === "imgur") {
    if (!config.imgurClientId.trim()) throw new Error("请填写 Imgur Client ID");
    return uploadForm(
      "https://api.imgur.com/3/image",
      blob,
      filename,
      "image",
      { Authorization: `Client-ID ${config.imgurClientId.trim()}` },
      "data.link",
    );
  }
  if (config.uploader === "picgo") {
    const url = config.picgoUrl.trim() || "http://127.0.0.1:36677/upload";
    const body = new FormData();
    body.append("list", blob, filename);
    const response = await fetch(url, { method: "POST", body });
    if (!response.ok) throw new Error(`PicGo 返回 ${response.status}`);
    const payload = (await response.json()) as { success?: boolean; result?: unknown };
    if (payload.success === false) throw new Error("PicGo 上传失败");
    return pickUrl(payload, "result.0");
  }
  if (!config.customUrl.trim()) throw new Error("请填写自定义上传地址");
  const headers: Record<string, string> = {};
  if (config.customToken.trim()) {
    headers.Authorization = config.customToken.trim().startsWith("Bearer ")
      ? config.customToken.trim()
      : `Bearer ${config.customToken.trim()}`;
  }
  return uploadForm(
    config.customUrl.trim(),
    blob,
    filename,
    config.customFileField.trim() || "file",
    headers,
    config.customUrlPath.trim() || "data.url",
  );
}

export async function testImageUploader(config: ImageConfig): Promise<string> {
  if (config.uploader === "none") return "当前不上传，图片保存在本机";
  if (config.uploader === "github") {
    const { owner, name } = githubParts(config.githubRepo);
    const response = await fetch("https://api.github.com/user", {
      headers: { Authorization: `Bearer ${config.githubToken.trim()}` },
    });
    if (!response.ok) throw new Error(`GitHub 验证失败（${response.status}）`);
    return `GitHub 已连接，将写入 ${owner}/${name}`;
  }
  if (config.uploader === "gitee") {
    const { owner, name } = githubParts(config.giteeRepo);
    if (!config.giteeToken.trim()) throw new Error("请填写 Gitee Token");
    const response = await fetch(
      `https://gitee.com/api/v5/user?access_token=${encodeURIComponent(config.giteeToken.trim())}`,
    );
    if (!response.ok) throw new Error(`Gitee 验证失败（${response.status}）`);
    return `Gitee 已连接，将写入 ${owner}/${name}`;
  }
  if (config.uploader === "smms") {
    const response = await fetch("https://sm.ms/api/v2/profile", {
      headers: { Authorization: config.smmsToken.trim() },
    });
    if (!response.ok) throw new Error(`SM.MS 验证失败（${response.status}）`);
    return "SM.MS 已连接";
  }
  if (config.uploader === "lsky") {
    const base = config.lskyUrl.trim().replace(/\/+$/, "");
    const response = await fetch(`${base}/api/v1/profile`, {
      headers: { Authorization: `Bearer ${config.lskyToken.trim()}` },
    });
    if (!response.ok) throw new Error(`兰空图床验证失败（${response.status}）`);
    return "兰空图床已连接";
  }
  if (config.uploader === "imgur") {
    if (!config.imgurClientId.trim()) throw new Error("请填写 Imgur Client ID");
    return `Imgur Client ID 已填写（${config.imgurClientId.trim().slice(0, 6)}…）`;
  }
  if (config.uploader === "picgo") {
    const url = config.picgoUrl.trim() || "http://127.0.0.1:36677/upload";
    const response = await fetch(url.replace(/\/upload\/?$/, "/"));
    if (!response.ok && response.status !== 404) {
      throw new Error("无法连接 PicGo");
    }
    return `PicGo 接口 ${url}`;
  }
  if (!config.customUrl.trim()) throw new Error("请填写自定义上传地址");
  return `自定义接口 ${config.customUrl.trim()}`;
}
