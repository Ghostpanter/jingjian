export const TTS_RATE_KEY = "jingjian.reader.tts.rate.v1";
export const TTS_PREFS_KEY = "jingjian.reader.tts.prefs.v1";
export const TTS_RATE_STEPS = [0.8, 0.92, 1.05, 1.2];

export type TtsLangMode = "auto" | "zh" | "en" | "mixed";
export type SpeakLang = "zh-CN" | "en-US";
export type TtsVoiceInfo = {
  name: string;
  lang: string;
  local?: boolean;
  quality?: number;
};
export type TtsPrefs = {
  lang: TtsLangMode;
  voiceName: string;
  rate: number;
};
export type SpeakChunk = {
  text: string;
  lang: SpeakLang;
};

export const DEFAULT_TTS_PREFS: TtsPrefs = {
  lang: "auto",
  voiceName: "",
  rate: 0.92,
};

export const TTS_LANG_MODES: { id: TtsLangMode; label: string; hint: string }[] = [
  { id: "auto", label: "自动", hint: "按正文切换中英文" },
  { id: "zh", label: "中文", hint: "整段用中文语音" },
  { id: "en", label: "英语", hint: "整段用英文语音" },
  { id: "mixed", label: "中英混合", hint: "英文词按词朗读" },
];

const LANG_MODES: TtsLangMode[] = ["auto", "zh", "en", "mixed"];
const LATIN_TOKEN = /[A-Za-z][A-Za-z0-9._+\-/#']*/g;

export function clampTtsRate(rate: number): number {
  if (!Number.isFinite(rate)) return DEFAULT_TTS_PREFS.rate;
  return Math.min(1.3, Math.max(0.7, rate));
}

export function readTtsRate(): number {
  return readTtsPrefs().rate;
}

export function writeTtsRate(rate: number) {
  writeTtsPrefs({ ...readTtsPrefs(), rate: clampTtsRate(rate) });
}

export function readTtsPrefs(): TtsPrefs {
  try {
    const raw = localStorage.getItem(TTS_PREFS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<TtsPrefs>;
      return {
        lang: LANG_MODES.includes(parsed.lang as TtsLangMode)
          ? (parsed.lang as TtsLangMode)
          : "auto",
        voiceName: typeof parsed.voiceName === "string" ? parsed.voiceName : "",
        rate: clampTtsRate(
          typeof parsed.rate === "number" ? parsed.rate : readLegacyRate(),
        ),
      };
    }
  } catch {
    // private mode or invalid json
  }
  return { ...DEFAULT_TTS_PREFS, rate: readLegacyRate() };
}

export function writeTtsPrefs(prefs: TtsPrefs) {
  const next: TtsPrefs = {
    lang: LANG_MODES.includes(prefs.lang) ? prefs.lang : "auto",
    voiceName: prefs.voiceName || "",
    rate: clampTtsRate(prefs.rate),
  };
  try {
    localStorage.setItem(TTS_PREFS_KEY, JSON.stringify(next));
    localStorage.setItem(TTS_RATE_KEY, String(next.rate));
  } catch {
    // private mode
  }
}

function readLegacyRate(): number {
  try {
    const raw = Number(localStorage.getItem(TTS_RATE_KEY));
    if (Number.isFinite(raw) && raw >= 0.7 && raw <= 1.3) return raw;
  } catch {
    // private mode
  }
  return DEFAULT_TTS_PREFS.rate;
}

export function voiceLangKind(lang: string, name = ""): "zh" | "en" | "other" {
  const hay = `${lang} ${name}`;
  if (/zh|cmn|chinese|yue|cantonese/i.test(hay)) return "zh";
  if (/(?:^|[\s(_-])en(?:[-_]|$)|english/i.test(hay)) return "en";
  return "other";
}

export function pickZhVoice(
  voices: Array<{ lang: string; name: string }>,
): { lang: string; name: string } | null {
  const zh = voices.filter((voice) => voiceLangKind(voice.lang, voice.name) === "zh");
  const preferred =
    zh.find((voice) =>
      /neural|xiaoxiao|xiaoyi|yunxi|yunyang|online|premium/i.test(voice.name),
    ) ??
    zh.find((voice) => /microsoft|google|tingting|meijia|huihui/i.test(voice.name)) ??
    zh[0];
  return preferred ?? null;
}

export function pickEnVoice(
  voices: Array<{ lang: string; name: string }>,
): { lang: string; name: string } | null {
  const en = voices.filter((voice) => voiceLangKind(voice.lang, voice.name) === "en");
  const preferred =
    en.find((voice) => /neural|online|premium|enhanced|natural/i.test(voice.name)) ??
    en.find((voice) =>
      /microsoft|google|samantha|aria|jenny|guy|davis|andrew/i.test(voice.name),
    ) ??
    en.find((voice) => /en-US|en_US/i.test(voice.lang)) ??
    en[0];
  return preferred ?? null;
}

export function pickVoiceForLang(
  voices: Array<{ lang: string; name: string }>,
  lang: SpeakLang,
  preferredName = "",
): { lang: string; name: string } | null {
  const want = lang === "en-US" ? "en" : "zh";
  if (preferredName) {
    const named = voices.find((item) => item.name === preferredName);
    if (named && voiceLangKind(named.lang, named.name) === want) return named;
  }
  const ranked = want === "en" ? pickEnVoice(voices) : pickZhVoice(voices);
  if (ranked) return ranked;
  if (preferredName) {
    const named = voices.find((item) => item.name === preferredName);
    if (named) return named;
  }
  return voices[0] ?? null;
}

export function sortTtsVoices(voices: TtsVoiceInfo[]): TtsVoiceInfo[] {
  return [...voices].sort((a, b) => {
    const rank = (item: TtsVoiceInfo) => {
      const kind = voiceLangKind(item.lang, item.name);
      return kind === "zh" ? 0 : kind === "en" ? 1 : 2;
    };
    const byKind = rank(a) - rank(b);
    if (byKind) return byKind;
    if (Boolean(a.local) !== Boolean(b.local)) return a.local ? -1 : 1;
    const byQuality = (b.quality ?? 0) - (a.quality ?? 0);
    if (byQuality) return byQuality;
    return a.name.localeCompare(b.name, "zh");
  });
}

export function ttsVoiceLabel(voice: TtsVoiceInfo): string {
  const kind = voiceLangKind(voice.lang, voice.name);
  const tag = kind === "zh" ? "中文" : kind === "en" ? "英语" : voice.lang || "其他";
  const online = voice.local === false ? " · 在线" : "";
  const name = voice.name
    .replace(/\s*-\s*(Chinese|English).*$/i, "")
    .replace(/#.*$/, "")
    .trim();
  return `${name || voice.name}（${tag}${online}）`;
}

export function splitSpeakChunks(
  text: string,
  mode: TtsLangMode = "auto",
): SpeakChunk[] {
  if (!text.trim()) return [];
  if (mode === "en") return [{ text, lang: "en-US" }];
  if (mode === "zh") return [{ text, lang: "zh-CN" }];
  if (mode === "auto") {
    const letters = (text.match(/[A-Za-z]/g) ?? []).length;
    const cjk = (text.match(/[\u3400-\u9fff]/g) ?? []).length;
    if (letters > 0 && cjk === 0) return [{ text, lang: "en-US" }];
    if (cjk > 0 && letters === 0) return [{ text, lang: "zh-CN" }];
  }
  return splitMixedChunks(text);
}

export function splitMixedChunks(text: string): SpeakChunk[] {
  const chunks: SpeakChunk[] = [];
  const re = new RegExp(LATIN_TOKEN.source, "g");
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text))) {
    const token = match[0];
    const letters = token.replace(/[^A-Za-z]/g, "").length;
    if (letters < 2) continue;
    if (match.index > last) appendChunk(chunks, text.slice(last, match.index), "zh-CN");
    appendChunk(chunks, token, "en-US");
    last = match.index + token.length;
  }
  if (last < text.length) appendChunk(chunks, text.slice(last), "zh-CN");
  return chunks.filter((chunk) => chunk.text.trim());
}

function appendChunk(chunks: SpeakChunk[], text: string, lang: SpeakLang) {
  if (!text) return;
  const weak = !/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7afA-Za-z0-9]/.test(text);
  const prev = chunks[chunks.length - 1];
  if (weak) {
    if (prev) prev.text += text;
    else chunks.push({ text, lang });
    return;
  }
  if (prev && prev.lang === lang) {
    prev.text += text;
    return;
  }
  chunks.push({ text, lang });
}

export function ttsPreviewSample(lang: TtsLangMode): string {
  if (lang === "en") return "Jingjian reads Kubernetes, JSON, and REST API as words.";
  return "静笺会把 Kubernetes、JSON 和 REST API 按单词朗读。";
}

export function speakableBlocks(root: ParentNode | null): string[] {
  if (!root) return [];
  return [...root.children].map((node) =>
    (node.textContent || "").replace(/\s+/g, " ").trim(),
  );
}

type TtsCallbacks = {
  onIndex: (index: number) => void;
  onEnd: () => void;
  onError: (message: string) => void;
};

export function ttsUnavailableMessage(native = false): string {
  if (native) return "请到系统设置打开「文字转语音」，并安装中文或英文语音包";
  return "当前窗口不能朗读，请在静笺安卓或电脑应用里使用";
}

function waitForWebVoices(speech: SpeechSynthesis): Promise<void> {
  if (speech.getVoices().length > 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => resolve();
    speech.addEventListener("voiceschanged", done, { once: true });
    window.setTimeout(done, 400);
  });
}

export async function listTtsVoices(): Promise<TtsVoiceInfo[]> {
  try {
    const mod = await import("./native-tts.ts");
    if (mod.nativeTtsPlatform()) {
      const voices = await mod.nativeTtsListVoices();
      if (voices.length) return voices;
    }
  } catch {
    // web fallback
  }
  const speech = typeof window !== "undefined" ? window.speechSynthesis : null;
  if (!speech) return [];
  await waitForWebVoices(speech);
  return speech.getVoices().map((voice) => ({
    name: voice.name,
    lang: voice.lang,
    local: voice.localService,
  }));
}

let previewController: ReturnType<typeof createTtsController> | null = null;

export function stopTtsPreview() {
  const current = previewController;
  previewController = null;
  current?.stop();
}

export function speakTtsPreview(prefs: TtsPrefs) {
  stopTtsPreview();
  return new Promise<string | null>((resolve) => {
    let settled = false;
    let controller: ReturnType<typeof createTtsController>;
    const done = (message: string | null) => {
      if (settled) return;
      settled = true;
      if (previewController === controller) previewController = null;
      resolve(message);
    };
    controller = createTtsController(
      {
        onIndex: () => undefined,
        onEnd: () => done(null),
        onError: (message) => done(message),
      },
      () => prefs,
    );
    previewController = controller;
    controller.start([ttsPreviewSample(prefs.lang)], 0);
  });
}

export function createTtsController(
  callbacks: TtsCallbacks,
  getPrefs: () => TtsPrefs = readTtsPrefs,
) {
  let blocks: string[] = [];
  let index = 0;
  let chunkIndex = 0;
  let chunks: SpeakChunk[] = [];
  let rate = getPrefs().rate;
  let playing = false;
  let paused = false;
  let utterance: SpeechSynthesisUtterance | null = null;
  let generation = 0;
  let native = false;
  let voices: TtsVoiceInfo[] = [];

  function synth(): SpeechSynthesis | null {
    return typeof window !== "undefined" ? window.speechSynthesis : null;
  }

  function prefs(): TtsPrefs {
    return getPrefs();
  }

  function voiceFor(lang: SpeakLang) {
    return pickVoiceForLang(voices, lang, prefs().voiceName);
  }

  async function speakNative(token: number) {
    const { nativeTtsSpeak } = await import("./native-tts.ts");
    while (playing && !paused && token === generation) {
      while (index < blocks.length && !blocks[index]) index += 1;
      const text = blocks[index];
      if (!text) {
        playing = false;
        paused = false;
        callbacks.onEnd();
        return;
      }
      callbacks.onIndex(index);
      chunks = splitSpeakChunks(text, prefs().lang);
      if (!chunks.length) {
        index += 1;
        chunkIndex = 0;
        continue;
      }
      for (; chunkIndex < chunks.length; chunkIndex += 1) {
        if (token !== generation || !playing || paused) return;
        const chunk = chunks[chunkIndex];
        const picked = voiceFor(chunk.lang);
        try {
          const result = await nativeTtsSpeak(
            chunk.text,
            rate,
            chunk.lang,
            picked?.name ?? "",
          );
          if (token !== generation || !playing || paused) return;
          if (result?.stopped) return;
        } catch {
          if (token !== generation) return;
          playing = false;
          paused = false;
          callbacks.onError("朗读中断");
          callbacks.onEnd();
          return;
        }
      }
      index += 1;
      chunkIndex = 0;
    }
  }

  function speakCurrent() {
    const speech = synth();
    if (!speech) {
      playing = false;
      callbacks.onError(ttsUnavailableMessage(false));
      callbacks.onEnd();
      return;
    }
    while (index < blocks.length && !blocks[index]) index += 1;
    const text = blocks[index];
    if (!text) {
      playing = false;
      paused = false;
      callbacks.onEnd();
      return;
    }
    chunks = splitSpeakChunks(text, prefs().lang);
    chunkIndex = 0;
    if (!chunks.length) {
      index += 1;
      speakCurrent();
      return;
    }
    callbacks.onIndex(index);
    speakWebChunk(speech);
  }

  function speakWebChunk(speech: SpeechSynthesis) {
    if (!playing || paused) return;
    const chunk = chunks[chunkIndex];
    if (!chunk) {
      index += 1;
      chunkIndex = 0;
      speakCurrent();
      return;
    }
    speech.cancel();
    const next = new SpeechSynthesisUtterance(chunk.text);
    const picked = voiceFor(chunk.lang);
    if (picked) {
      const matched = speech.getVoices().find((item) => item.name === picked.name);
      if (matched) next.voice = matched;
      next.lang = picked.lang || chunk.lang;
    } else {
      next.lang = chunk.lang;
    }
    next.rate = rate;
    next.pitch = 1;
    next.onend = () => {
      if (!playing || paused) return;
      chunkIndex += 1;
      speakWebChunk(speech);
    };
    next.onerror = () => {
      if (!playing) return;
      playing = false;
      paused = false;
      callbacks.onError("朗读中断");
      callbacks.onEnd();
    };
    utterance = next;
    speech.speak(next);
  }

  return {
    get playing() {
      return playing;
    },
    get paused() {
      return paused;
    },
    get index() {
      return index;
    },
    get rate() {
      return rate;
    },
    setRate(next: number, persist = true) {
      rate = clampTtsRate(next);
      if (persist) writeTtsRate(rate);
    },
    start(nextBlocks: string[], from = 0) {
      void (async () => {
        const token = ++generation;
        blocks = nextBlocks;
        chunkIndex = 0;
        chunks = [];
        rate = clampTtsRate(getPrefs().rate);
        if (!blocks.some(Boolean)) {
          callbacks.onError("这一章没有可朗读的正文");
          callbacks.onEnd();
          return;
        }
        index = Math.min(Math.max(0, from), blocks.length - 1);
        native = false;
        let onNative = false;
        try {
          const mod = await import("./native-tts.ts");
          onNative = mod.nativeTtsPlatform();
          native = await mod.nativeTtsReady();
        } catch {
          native = false;
        }
        if (token !== generation) return;
        if (!native && !synth()) {
          callbacks.onError(ttsUnavailableMessage(onNative));
          callbacks.onEnd();
          return;
        }
        try {
          voices = await listTtsVoices();
        } catch {
          voices = [];
        }
        if (token !== generation) return;
        if (!native) {
          const speech = synth();
          if (speech) await waitForWebVoices(speech);
          if (token !== generation) return;
          voices = synth()?.getVoices().map((voice) => ({
            name: voice.name,
            lang: voice.lang,
            local: voice.localService,
          })) ?? voices;
        }
        playing = true;
        paused = false;
        if (native) {
          await speakNative(token);
          return;
        }
        speakCurrent();
      })();
    },
    pause() {
      if (!playing) return;
      paused = true;
      if (native) {
        void import("./native-tts.ts").then((mod) => mod.nativeTtsStop());
        return;
      }
      const speech = synth();
      if (!speech) return;
      if (typeof speech.pause === "function") speech.pause();
      else speech.cancel();
    },
    resume() {
      if (!playing || !paused) return;
      paused = false;
      if (native) {
        const token = generation;
        void speakNative(token);
        return;
      }
      const speech = synth();
      if (!speech) return;
      if (typeof speech.resume === "function" && speech.paused) {
        speech.resume();
        return;
      }
      speakCurrent();
    },
    stop() {
      generation += 1;
      playing = false;
      paused = false;
      utterance = null;
      chunkIndex = 0;
      chunks = [];
      if (native) void import("./native-tts.ts").then((mod) => mod.nativeTtsStop());
      synth()?.cancel();
      callbacks.onEnd();
    },
    toggle(nextBlocks: string[]) {
      if (playing && paused) {
        this.resume();
        return;
      }
      if (playing) {
        this.pause();
        return;
      }
      this.start(nextBlocks, 0);
    },
    dispose() {
      generation += 1;
      playing = false;
      paused = false;
      utterance = null;
      chunkIndex = 0;
      chunks = [];
      if (native) void import("./native-tts.ts").then((mod) => mod.nativeTtsStop());
      synth()?.cancel();
    },
  };
}
