import assert from "node:assert/strict";
import { test } from "node:test";
import { pickZhVoice, speakableBlocks, ttsUnavailableMessage } from "./reader-tts.ts";

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
  assert.match(ttsUnavailableMessage(true), /文字转语音/);
});
