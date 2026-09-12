import assert from "node:assert/strict";
import { test } from "node:test";
import {
  derivePalette,
  isDarkTheme,
  luminance,
  paletteFor,
  parseHex,
  THEME_OPTIONS,
} from "./theme.ts";

test("parses hex colors", () => {
  assert.deepEqual(parseHex("#2c4a42"), [44, 74, 66]);
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
});

test("github theme stays light with blue accent", () => {
  const palette = paletteFor({
    id: "github",
    customLight: { bg: "#fff", fg: "#111", accent: "#0969da" },
    customDark: { bg: "#111", fg: "#eee", accent: "#4493f8" },
  });
  assert.equal(palette.bg.toLowerCase(), "#ffffff");
  assert.equal(palette.accent.toLowerCase(), "#0969da");
  assert.equal(isDarkTheme("github"), false);
  assert.equal(isDarkTheme("ink"), true);
  assert.ok(luminance(palette.bg) > 0.5);
});

test("custom dark derives readable muted text", () => {
  const palette = derivePalette({ bg: "#111111", fg: "#f5f0e8", accent: "#8fafa4" }, true);
  assert.notEqual(palette.muted, palette.bg);
  assert.notEqual(palette.border, palette.bg);
  assert.ok(THEME_OPTIONS.some((item) => item.id === "custom-light"));
  assert.ok(THEME_OPTIONS.some((item) => item.id === "github-dark"));
  assert.ok(THEME_OPTIONS.some((item) => item.label.includes("白底")));
  assert.ok(THEME_OPTIONS.some((item) => item.id === "github" && item.label === "GitHub"));
});
