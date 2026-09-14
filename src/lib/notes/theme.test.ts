import assert from "node:assert/strict";
import { test } from "node:test";
import {
  derivePalette,
  isDarkTheme,
  luminance,
  paletteFor,
  parseHex,
  statusBarStyleFor,
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

test("paper syntax colors stay distinct from body text", () => {
  const palette = paletteFor({
    id: "paper",
    customLight: { bg: "#fff", fg: "#111", accent: "#2c4a42" },
    customDark: { bg: "#111", fg: "#eee", accent: "#8fafa4" },
  });
  assert.notEqual(palette.syntaxKeyword.toLowerCase(), palette.fg.toLowerCase());
  assert.notEqual(palette.syntaxKeyword.toLowerCase(), palette.accent.toLowerCase());
  assert.notEqual(palette.syntaxString.toLowerCase(), palette.syntaxKeyword.toLowerCase());
  assert.notEqual(palette.syntaxFunction.toLowerCase(), palette.syntaxNumber.toLowerCase());
});

test("github-dark uses high-contrast syntax colors", () => {
  const palette = paletteFor({
    id: "github-dark",
    customLight: { bg: "#fff", fg: "#111", accent: "#0969da" },
    customDark: { bg: "#111", fg: "#eee", accent: "#4493f8" },
  });
  assert.equal(palette.syntaxKeyword.toLowerCase(), "#ff7b72");
  assert.equal(palette.syntaxFunction.toLowerCase(), "#d2a8ff");
});

test("status bar glyphs follow the paper: dark on light, light on dark", () => {
  assert.equal(statusBarStyleFor(false), "LIGHT");
  assert.equal(statusBarStyleFor(true), "DARK");
});
