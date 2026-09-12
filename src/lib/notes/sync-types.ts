export type SyncProvider = "off" | "server" | "webdav" | "folder";

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
};

export type SyncAdapter = {
  list(): Promise<import("./types").Note[]>;
  upsert(note: import("./types").Note): Promise<void>;
  remove(id: string): Promise<void>;
  test(): Promise<string>;
};
