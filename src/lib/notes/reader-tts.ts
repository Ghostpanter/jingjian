export const TTS_RATE_KEY = "jingjian.reader.tts.rate.v1";

export function readTtsRate(): number {
  try {
    const raw = Number(localStorage.getItem(TTS_RATE_KEY));
    if (Number.isFinite(raw) && raw >= 0.7 && raw <= 1.3) return raw;
  } catch {
    // private mode
  }
  return 0.92;
}

export function writeTtsRate(rate: number) {
  try {
    localStorage.setItem(TTS_RATE_KEY, String(rate));
  } catch {
    // private mode
  }
}

export function pickZhVoice(
  voices: Array<{ lang: string; name: string }>,
): { lang: string; name: string } | null {
  const zh = voices.filter((voice) => /zh|cmn|chinese/i.test(`${voice.lang} ${voice.name}`));
  const preferred =
    zh.find((voice) =>
      /neural|xiaoxiao|xiaoyi|yunxi|yunyang|online|premium/i.test(voice.name),
    ) ??
    zh.find((voice) => /microsoft|google|tingting|meijia|huihui/i.test(voice.name)) ??
    zh[0];
  return preferred ?? null;
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
  if (native) return "请到系统设置打开「文字转语音」，并安装中文语音包";
  return "当前窗口不能朗读，请在静笺安卓或电脑应用里使用";
}

export function createTtsController(callbacks: TtsCallbacks) {
  let blocks: string[] = [];
  let index = 0;
  let rate = readTtsRate();
  let playing = false;
  let paused = false;
  let utterance: SpeechSynthesisUtterance | null = null;
  let generation = 0;
  let native = false;

  function synth(): SpeechSynthesis | null {
    return typeof window !== "undefined" ? window.speechSynthesis : null;
  }

  function waitForVoices(speech: SpeechSynthesis): Promise<void> {
    if (speech.getVoices().length > 0) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => resolve();
      speech.addEventListener("voiceschanged", done, { once: true });
      window.setTimeout(done, 400);
    });
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
      try {
        const result = await nativeTtsSpeak(text, rate);
        if (token !== generation || !playing || paused) return;
        if (result?.stopped) return;
        index += 1;
      } catch {
        if (token !== generation) return;
        playing = false;
        paused = false;
        callbacks.onError("朗读中断");
        callbacks.onEnd();
        return;
      }
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
    speech.cancel();
    const next = new SpeechSynthesisUtterance(text);
    const voice = pickZhVoice(speech.getVoices());
    if (voice) {
      const matched = speech.getVoices().find((item) => item.name === voice.name);
      if (matched) next.voice = matched;
      next.lang = voice.lang || "zh-CN";
    } else {
      next.lang = "zh-CN";
    }
    next.rate = rate;
    next.pitch = 1;
    next.onend = () => {
      if (!playing || paused) return;
      index += 1;
      callbacks.onIndex(index);
      speakCurrent();
    };
    next.onerror = () => {
      if (!playing) return;
      playing = false;
      paused = false;
      callbacks.onError("朗读中断");
      callbacks.onEnd();
    };
    utterance = next;
    callbacks.onIndex(index);
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
    setRate(next: number) {
      rate = Math.min(1.3, Math.max(0.7, next));
      writeTtsRate(rate);
    },
    start(nextBlocks: string[], from = 0) {
      void (async () => {
        const token = ++generation;
        blocks = nextBlocks;
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
        if (!native) {
          const speech = synth();
          if (speech) await waitForVoices(speech);
          if (token !== generation) return;
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
      if (native) void import("./native-tts.ts").then((mod) => mod.nativeTtsStop());
      synth()?.cancel();
    },
  };
}

