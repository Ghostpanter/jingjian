import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseTtsPrefs,
  pickEnVoice,
  pickVoiceForLang,
  pickZhVoice,
  shouldContinueTts,
  splitSpeakChunks,
  speakableBlocks,
  ttsUnavailableMessage,
  ttsVoiceLabel,
  voiceLangKind,
} from "./reader-tts.ts";

test("prefers a neural chinese voice", () => {
  const picked = pickZhVoice([
    { lang: "en-US", name: "Samantha" },
    { lang: "zh-CN", name: "Google 普通话" },
    { lang: "zh-CN", name: "Microsoft Xiaoxiao Online (Natural)" },
  ]);
  assert.equal(picked?.name, "Microsoft Xiaoxiao Online (Natural)");
});

test("falls back to any chinese voice", () => {
  const picked = pickZhVoice([
    { lang: "en-GB", name: "Daniel" },
    { lang: "zh-TW", name: "Tingting" },
  ]);
  assert.equal(picked?.lang, "zh-TW");
});

test("prefers a neural english voice", () => {
  const picked = pickEnVoice([
    { lang: "zh-CN", name: "Xiaoxiao" },
    { lang: "en-GB", name: "Daniel" },
    { lang: "en-US", name: "Microsoft Aria Online (Natural)" },
  ]);
  assert.equal(picked?.name, "Microsoft Aria Online (Natural)");
});

test("picks the matching language for a named voice", () => {
  const voices = [
    { lang: "zh-CN", name: "Xiaoxiao" },
    { lang: "en-US", name: "Aria" },
  ];
  assert.equal(pickVoiceForLang(voices, "en-US", "Xiaoxiao")?.name, "Aria");
  assert.equal(pickVoiceForLang(voices, "zh-CN", "Aria")?.name, "Xiaoxiao");
  assert.equal(pickVoiceForLang(voices, "en-US", "Aria")?.name, "Aria");
});

test("classifies chinese and english voice langs", () => {
  assert.equal(voiceLangKind("zh-CN", "Xiaoxiao"), "zh");
  assert.equal(voiceLangKind("cmn-Hans-CN", ""), "zh");
  assert.equal(voiceLangKind("en-US", "Samantha"), "en");
  assert.equal(voiceLangKind("en_GB", "Daniel"), "en");
  assert.equal(voiceLangKind("ja-JP", "Kyoko"), "other");
});

test("mixed chunks speak english terms as words not letters", () => {
  const chunks = splitSpeakChunks(
    "在 Kubernetes 集群里部署 REST API 和 JSON。",
    "mixed",
  );
  const english = chunks
    .filter((chunk) => chunk.lang === "en-US")
    .map((chunk) => chunk.text.replace(/[。．.]+$/g, "").trim());
  assert.deepEqual(english, ["Kubernetes", "REST API", "JSON"]);
  assert.equal(chunks[0].lang, "zh-CN");
  assert.ok(chunks.every((chunk) => !/^[A-Za-z]$/.test(chunk.text.trim())));
});

test("adjacent english terms stay one utterance", () => {
  const chunks = splitSpeakChunks("调用 REST API Gateway。", "auto");
  const english = chunks
    .filter((chunk) => chunk.lang === "en-US")
    .map((chunk) => chunk.text.replace(/[。．.]+$/g, "").trim());
  assert.deepEqual(english, ["REST API Gateway"]);
});

test("single latin letters stay with chinese", () => {
  const chunks = splitSpeakChunks("这是 A 计划。", "mixed");
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].lang, "zh-CN");
});

test("forced english keeps the whole paragraph", () => {
  const chunks = splitSpeakChunks("在 Kubernetes 里。", "en");
  assert.deepEqual(chunks, [{ text: "在 Kubernetes 里。", lang: "en-US" }]);
});

test("forced chinese keeps the whole paragraph", () => {
  const chunks = splitSpeakChunks("在 Kubernetes 里。", "zh");
  assert.deepEqual(chunks, [{ text: "在 Kubernetes 里。", lang: "zh-CN" }]);
});

test("auto keeps a pure english paragraph in one voice", () => {
  const text = "Call the REST API with a JSON payload.";
  assert.deepEqual(splitSpeakChunks(text, "auto"), [{ text, lang: "en-US" }]);
});

test("technical tokens including Node.js and OAuth2", () => {
  const chunks = splitSpeakChunks("用 Node.js 和 OAuth2 访问 IPv6。", "auto");
  const english = chunks
    .filter((chunk) => chunk.lang === "en-US")
    .map((chunk) => chunk.text.replace(/[。．.]+$/g, "").trim());
  assert.deepEqual(english, ["Node.js", "OAuth2", "IPv6"]);
});

test("voice label marks language", () => {
  assert.match(
    ttsVoiceLabel({ name: "Microsoft Xiaoxiao Online (Natural)", lang: "zh-CN" }),
    /中文/,
  );
  assert.match(ttsVoiceLabel({ name: "Google US English", lang: "en-US", local: false }), /英语/);
});

test("speakable blocks keep child indexes including blanks", () => {
  const root = {
    children: [
      { textContent: "  第一段  " },
      { textContent: "\n" },
      { textContent: "第三段" },
    ],
  } as unknown as ParentNode;
  assert.deepEqual(speakableBlocks(root), ["第一段", "", "第三段"]);
});

test("unavailable copy points to the app on web and system tts on native", () => {
  assert.match(ttsUnavailableMessage(false), /安卓或电脑应用/);
  assert.match(ttsUnavailableMessage(true), /中文或英文语音包/);
});

test("autoplay defaults on and can be turned off", () => {
  assert.equal(parseTtsPrefs({}).autoplay, true);
  assert.equal(parseTtsPrefs({ autoplay: false }).autoplay, false);
  assert.equal(parseTtsPrefs({ autoplay: true, lang: "en" }).lang, "en");
});

test("continues only when a chapter finishes, autoplay is on, and a next chapter exists", () => {
  assert.equal(shouldContinueTts(true, true, "finished"), true);
  assert.equal(shouldContinueTts(true, true, "stopped"), false);
  assert.equal(shouldContinueTts(false, true, "finished"), false);
  assert.equal(shouldContinueTts(true, false, "finished"), false);
});
