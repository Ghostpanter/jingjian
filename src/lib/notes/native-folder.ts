import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export type LaunchFile = {
  kind?: string;
  uri?: string;
  name?: string;
  mime?: string;
  text?: string;
};

export type OpenUriFile = {
  uri: string;
  name: string;
  mime: string;
  data: string;
  text?: string;
};

export type ImportFolderNativeFile = {
  name: string;
  relativePath: string;
  content: string;
};

type NativeFolderPlugin = {
  pick(): Promise<{ name: string }>;
  pickImportFolder(): Promise<{ name: string; files: ImportFolderNativeFile[] }>;
  ensureLibrary(): Promise<{ path: string }>;
  mkdirLibrary(options: { relative: string }): Promise<{ path: string }>;
  rmdirLibrary(options: { relative: string }): Promise<void>;
  writeLibrary(options: { relative: string; content: string }): Promise<{ path: string }>;
  removeLibrary(options: { relative: string }): Promise<void>;
  status(): Promise<{ ok: boolean; name: string }>;
  list(): Promise<{ files: Array<{ name: string; content: string }> }>;
  write(options: { name: string; content: string; shortId: string }): Promise<void>;
  remove(options: { shortId: string }): Promise<void>;
  saveFile(options: { name: string; mime: string; data: string }): Promise<{ uri: string; name: string }>;
  pickSaveFile(options: { name: string; mime: string }): Promise<{ uri: string; name: string }>;
  writeSaveFile(options: {
    uri: string;
    name: string;
    mime: string;
    data: string;
  }): Promise<{ uri: string; name: string }>;
  consumeLaunchFile(): Promise<LaunchFile>;
  readOpenUri(options: { uri: string; name?: string }): Promise<OpenUriFile>;
  setChrome(options: { bg: string; dark: boolean }): Promise<void>;
  addListener(
    event: "openFile",
    callback: (data: LaunchFile) => void,
  ): Promise<PluginListenerHandle>;
};

const plugin = registerPlugin<NativeFolderPlugin>("JingjianFolder");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export const nativeFolder = plugin;
