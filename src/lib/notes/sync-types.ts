export type SyncProvider = "off" | "server" | "webdav" | "folder" | "oss";

export type OssVendor =
  | "aliyun"
  | "tencent"
  | "huawei"
  | "qiniu"
  | "volcengine"
  | "aws"
  | "minio";

export type SyncConfig = {
  provider: SyncProvider;
  autoSync: boolean;
  serverUrl: string;
  serverToken: string;
  webdavUrl: string;
  webdavUser: string;
  webdavPassword: string;
  webdavPath: string;
  folderPath: string;
  ossVendor: OssVendor;
  ossEndpoint: string;
  ossRegion: string;
  ossBucket: string;
  ossAccessKey: string;
  ossSecretKey: string;
  ossPrefix: string;
  ossPathStyle: boolean;
};

export type SyncStatus = {
  state: "idle" | "syncing" | "ok" | "error";
  message: string;
  at: number | null;
};

export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  provider: "off",
  autoSync: true,
  serverUrl: "http://127.0.0.1:8787",
  serverToken: "",
  webdavUrl: "https://dav.jianguoyun.com/dav/",
  webdavUser: "",
  webdavPassword: "",
  webdavPath: "/静笺",
  folderPath: "Jingjian",
  ossVendor: "aliyun",
  ossEndpoint: "oss-cn-hangzhou.aliyuncs.com",
  ossRegion: "cn-hangzhou",
  ossBucket: "",
  ossAccessKey: "",
  ossSecretKey: "",
  ossPrefix: "jingjian",
  ossPathStyle: false,
};

export type SyncAdapter = {
  list(): Promise<import("./types").Note[]>;
  upsert(note: import("./types").Note): Promise<void>;
  remove(id: string): Promise<void>;
  test(): Promise<string>;
};
