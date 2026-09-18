import { registerPlugin } from "@capacitor/core";
import { isNativeApp } from "./native-folder";
import type { TtsVoiceInfo } from "./reader-tts";

type NativeTtsPlugin = {
  available(): Promise<{ ok: boolean; hasZh?: boolean; hasEn?: boolean }>;
  listVoices(): Promise<{ voices: TtsVoiceInfo[] }>;
  speak(options: {
    text: string;
    rate: number;
    lang?: string;
    voiceName?: string;
  }): Promise<{ stopped?: boolean }>;
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

export async function nativeTtsListVoices(): Promise<TtsVoiceInfo[]> {
  if (!isNativeApp()) return [];
  try {
    const result = await plugin.listVoices();
    return Array.isArray(result.voices) ? result.voices : [];
  } catch {
    return [];
  }
}

export function nativeTtsSpeak(
  text: string,
  rate: number,
  lang?: string,
  voiceName?: string,
) {
  return plugin.speak({ text, rate, lang, voiceName });
}

export function nativeTtsStop() {
  return plugin.stop().catch(() => undefined);
}
