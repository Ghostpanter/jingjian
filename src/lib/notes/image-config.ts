export type ImageInsertAction = "none" | "copy" | "upload";

export type ImageUploader =
  | "none"
  | "github"
  | "gitee"
  | "smms"
  | "lsky"
  | "imgur"
  | "picgo"
  | "custom";

export type ImageConfig = {
  insertAction: ImageInsertAction;
  applyToLocal: boolean;
  applyToRemote: boolean;
  yamlUpload: boolean;
  preferRelative: boolean;
  relativeDotSlash: boolean;
  escapeUrl: boolean;
  uploader: ImageUploader;
  githubToken: string;
  githubRepo: string;
  githubBranch: string;
  githubPath: string;
  githubLink: "raw" | "jsdelivr" | "custom";
  githubDomain: string;
  giteeToken: string;
  giteeRepo: string;
  giteeBranch: string;
  giteePath: string;
  smmsToken: string;
  lskyUrl: string;
  lskyToken: string;
  imgurClientId: string;
  picgoUrl: string;
  customUrl: string;
  customToken: string;
  customFileField: string;
  customUrlPath: string;
};

const STORAGE_KEY = "jingjian.image.v1";

export const DEFAULT_IMAGE_CONFIG: ImageConfig = {
  insertAction: "none",
  applyToLocal: true,
  applyToRemote: false,
  yamlUpload: false,
  preferRelative: true,
  relativeDotSlash: false,
  escapeUrl: false,
  uploader: "none",
  githubToken: "",
  githubRepo: "",
  githubBranch: "main",
  githubPath: "jingjian",
  githubLink: "jsdelivr",
  githubDomain: "",
  giteeToken: "",
  giteeRepo: "",
  giteeBranch: "master",
  giteePath: "jingjian",
  smmsToken: "",
  lskyUrl: "",
  lskyToken: "",
  imgurClientId: "",
  picgoUrl: "http://127.0.0.1:36677/upload",
  customUrl: "",
  customToken: "",
  customFileField: "file",
  customUrlPath: "data.url",
};

const ACTIONS: ImageInsertAction[] = ["none", "copy", "upload"];
const UPLOADERS: ImageUploader[] = [
  "none",
  "github",
  "gitee",
  "smms",
  "lsky",
  "imgur",
  "picgo",
  "custom",
];

export function readImageConfig(): ImageConfig {
  if (typeof localStorage === "undefined") return { ...DEFAULT_IMAGE_CONFIG };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_IMAGE_CONFIG };
    const parsed = JSON.parse(raw) as Partial<ImageConfig>;
    return {
      ...DEFAULT_IMAGE_CONFIG,
      ...parsed,
      insertAction: ACTIONS.includes(parsed.insertAction as ImageInsertAction)
        ? (parsed.insertAction as ImageInsertAction)
        : "none",
      uploader: UPLOADERS.includes(parsed.uploader as ImageUploader)
        ? (parsed.uploader as ImageUploader)
        : "none",
      githubLink:
        parsed.githubLink === "raw" || parsed.githubLink === "custom"
          ? parsed.githubLink
          : "jsdelivr",
      applyToLocal: parsed.applyToLocal !== false,
    };
  } catch {
    return { ...DEFAULT_IMAGE_CONFIG };
  }
}

export function writeImageConfig(config: ImageConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function formatImageSrc(path: string, config: ImageConfig): string {
  let src = path.replace(/^\.\//, "");
  if (config.preferRelative && !src.startsWith("http") && !src.startsWith("/")) {
    src = config.relativeDotSlash ? `./${src}` : src;
  }
  return config.escapeUrl ? encodeURI(src) : src;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

/**
 * Import Typora / PicGo `data.json` (or just the `picBed` object) so a tablet
 * can reuse the same GitHub / SM.MS / 兰空 / Imgur / Gitee credentials
 * without running the PicGo desktop app.
 */
export function applyPicgoConfig(raw: string, current: ImageConfig): ImageConfig {
  const parsed = JSON.parse(raw) as unknown;
  const root = asRecord(parsed);
  if (!root) throw new Error("不是有效的 PicGo 配置");
  const picBed = asRecord(root.picBed) ?? root;
  const currentName = str(picBed.current || picBed.uploader).toLowerCase();
  const next: ImageConfig = { ...current, insertAction: "upload" };

  const github = asRecord(picBed.github);
  if (github) {
    next.githubRepo = str(github.repo, next.githubRepo);
    next.githubToken = str(github.token, next.githubToken);
    next.githubPath = str(github.path, next.githubPath).replace(/\/+$/, "");
    next.githubBranch = str(github.branch, next.githubBranch) || "main";
    const customUrl = str(github.customUrl);
    if (customUrl) {
      next.githubLink = "custom";
      next.githubDomain = customUrl.replace(/\/+$/, "");
    }
  }

  const gitee = asRecord(picBed.gitee);
  if (gitee) {
    next.giteeRepo = str(gitee.repo, next.giteeRepo);
    next.giteeToken = str(gitee.token, next.giteeToken);
    next.giteePath = str(gitee.path, next.giteePath).replace(/\/+$/, "");
    next.giteeBranch = str(gitee.branch, next.giteeBranch) || "master";
  }

  const smms = asRecord(picBed.smms);
  if (smms) next.smmsToken = str(smms.token, next.smmsToken);

  const lsky = asRecord(picBed.lskyPro) ?? asRecord(picBed.lsky);
  if (lsky) {
    next.lskyUrl = str(lsky.serverUrl ?? lsky.url, next.lskyUrl);
    next.lskyToken = str(lsky.token, next.lskyToken);
  }

  const imgur = asRecord(picBed.imgur);
  if (imgur) next.imgurClientId = str(imgur.clientId ?? imgur.client_id, next.imgurClientId);

  const custom =
    asRecord(picBed["webhook"]) ??
    asRecord(picBed.custom) ??
    asRecord(picBed["github-plus"]);
  if (custom && str(custom.url || custom.endpoint)) {
    next.customUrl = str(custom.url || custom.endpoint, next.customUrl);
    next.customToken = str(custom.token || custom.authorization, next.customToken);
    next.customFileField = str(custom.fileName || custom.field, next.customFileField);
    next.customUrlPath = str(custom.jsonPath, next.customUrlPath);
  }

  const map: Record<string, ImageUploader> = {
    github: "github",
    gitee: "gitee",
    smms: "smms",
    lsky: "lsky",
    lskypro: "lsky",
    imgur: "imgur",
    webhook: "custom",
    custom: "custom",
  };
  if (map[currentName]) next.uploader = map[currentName];
  else if (github && (next.githubToken || next.githubRepo)) next.uploader = "github";
  else if (smms && next.smmsToken) next.uploader = "smms";
  else if (lsky && (next.lskyUrl || next.lskyToken)) next.uploader = "lsky";
  else if (imgur && next.imgurClientId) next.uploader = "imgur";
  else if (gitee && (next.giteeToken || next.giteeRepo)) next.uploader = "gitee";

  if (next.uploader === "none") {
    throw new Error("PicGo 配置里没有可用的图床");
  }
  return next;
}
