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

export function createTtsController(callbacks: TtsCallbacks) {
  let blocks: string[] = [];
  let index = 0;
  let rate = readTtsRate();
  let playing = false;
  let paused = false;
  let utterance: SpeechSynthesisUtterance | null = null;

  function synth(): SpeechSynthesis | null {
    return typeof window !== "undefined" ? window.speechSynthesis : null;
  }

  function speakCurrent() {
    const speech = synth();
    if (!speech) {
      callbacks.onError("这台设备不能朗读");
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
      const speech = synth();
      if (!speech) {
        callbacks.onError("这台设备不能朗读");
        return;
      }
      if (speech.getVoices().length === 0) {
        speech.addEventListener("voiceschanged", () => undefined, { once: true });
      }
      blocks = nextBlocks;
      if (!blocks.some(Boolean)) {
        callbacks.onError("这一章没有可朗读的正文");
        return;
      }
      index = Math.min(Math.max(0, from), blocks.length - 1);
      playing = true;
      paused = false;
      speakCurrent();
    },
    pause() {
      const speech = synth();
      if (!playing || !speech) return;
      paused = true;
      if (typeof speech.pause === "function") speech.pause();
      else {
        speech.cancel();
      }
    },
    resume() {
      const speech = synth();
      if (!playing || !paused || !speech) return;
      paused = false;
      if (typeof speech.resume === "function" && speech.paused) {
        speech.resume();
        return;
      }
      speakCurrent();
    },
    stop() {
      playing = false;
      paused = false;
      utterance = null;
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
      playing = false;
      paused = false;
      utterance = null;
      synth()?.cancel();
    },
  };
}
