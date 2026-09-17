import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native-folder";

type NativeTtsPlugin = {
  available(): Promise<{ ok: boolean }>;
  speak(options: { text: string; rate: number }): Promise<{ stopped?: boolean }>;
  stop(): Promise<void>;
};

const plugin = registerPlugin<NativeTtsPlugin>("JingjianTts");

export function nativeTtsPlatform(): boolean {
  return isNativeApp();
}

export async function nativeTtsReady(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const status = await plugin.available();
    return Boolean(status.ok);
  } catch {
    return false;
  }
}

export function nativeTtsSpeak(text: string, rate: number) {
  return plugin.speak({ text, rate });
}

export function nativeTtsStop() {
  return plugin.stop().catch(() => undefined);
}
