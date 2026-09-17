import assert from "node:assert/strict";
import { test } from "node:test";
import {
  chromeFromStoredChrome,
  chromeFromStoredTheme,
  THEME_BOOT_SCRIPT,
} from "./theme-boot.ts";

test("chrome snapshot wins over the default paper palette", () => {
  const chrome = chromeFromStoredChrome(
    JSON.stringify({ bg: "#0d1117", fg: "#e6edf3", dark: true }),
  );
  assert.ok(chrome);
  assert.equal(chrome.bg, "#0d1117");
  assert.equal(chrome.fg, "#e6edf3");
  assert.equal(chrome.dark, true);
  assert.equal(chrome.paper, "#0d1117");
});

test("chrome snapshot without fg picks ink or paper ink by dark flag", () => {
  const dark = chromeFromStoredChrome(JSON.stringify({ bg: "#161513", dark: true }));
  const light = chromeFromStoredChrome(JSON.stringify({ bg: "#ffffff", dark: false }));
  assert.equal(dark?.fg, "#e8e2d6");
  assert.equal(light?.fg, "#1a1814");
});

test("invalid chrome snapshot is ignored", () => {
  assert.equal(chromeFromStoredChrome(null), null);
  assert.equal(chromeFromStoredChrome("{"), null);
  assert.equal(chromeFromStoredChrome(JSON.stringify({ bg: "red", dark: true })), null);
});

test("stored theme maps presets before the first stylesheet paint", () => {
  assert.equal(chromeFromStoredTheme(null).bg, "#f2ede4");
  assert.deepEqual(chromeFromStoredTheme(JSON.stringify({ id: "ink" })), {
    bg: "#161513",
    fg: "#e8e2d6",
    paper: "#1a1816",
    surface: "#1e1c19",
    dark: true,
  });
  assert.equal(chromeFromStoredTheme(JSON.stringify({ id: "github" })).bg, "#ffffff");
  assert.equal(chromeFromStoredTheme(JSON.stringify({ id: "github-dark" })).dark, true);
  const custom = chromeFromStoredTheme(
    JSON.stringify({ id: "custom-dark", customDark: { bg: "#112233", fg: "#fefefe" } }),
  );
  assert.equal(custom.bg, "#112233");
  assert.equal(custom.fg, "#fefefe");
  assert.equal(custom.dark, true);
});

test("boot script prefers the last painted chrome over the theme id", () => {
  assert.match(THEME_BOOT_SCRIPT, /jingjian\.chrome\.v1/);
  assert.match(THEME_BOOT_SCRIPT, /jingjian\.theme\.v1/);
  assert.ok(
    THEME_BOOT_SCRIPT.indexOf("jingjian.chrome.v1") <
      THEME_BOOT_SCRIPT.indexOf("jingjian.theme.v1"),
  );
});
