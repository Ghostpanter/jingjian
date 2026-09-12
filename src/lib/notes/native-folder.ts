import { Capacitor, registerPlugin } from "@capacitor/core";

type NativeFolderPlugin = {
  pick(): Promise<{ name: string }>;
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
};

const plugin = registerPlugin<NativeFolderPlugin>("JingjianFolder");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export const nativeFolder = plugin;
