import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  MAC_HINT,
  MAC_LAUNCHER,
  MAC_LAUNCHER_NAME,
  OPEN_HINT_NAME,
  WINDOWS_HINT,
  WINDOWS_LAUNCHER,
  WINDOWS_LAUNCHER_NAME,
  writeDesktopLaunchers,
} from "./desktop-launchers.mjs";

test("windows launcher unblocks MOTW then starts the app", () => {
  assert.match(WINDOWS_LAUNCHER, /Unblock-File/);
  assert.match(WINDOWS_LAUNCHER, /Jingjian\.exe/);
  assert.match(WINDOWS_HINT, /打开静笺\.bat/);
});

test("mac launcher strips quarantine then opens the app", () => {
  assert.match(MAC_LAUNCHER, /xattr -dr com\.apple\.quarantine/);
  assert.match(MAC_LAUNCHER, /Jingjian\.app/);
  assert.match(MAC_LAUNCHER, /^#!\/bin\/bash/m);
  assert.match(MAC_HINT, /打开静笺\.command/);
});

test("writeDesktopLaunchers writes windows files with CRLF", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "jingjian-launch-win-"));
  try {
    writeDesktopLaunchers(dir, "win32");
    const bat = readFileSync(path.join(dir, WINDOWS_LAUNCHER_NAME), "utf8");
    assert.match(bat, /\r\n/);
    assert.match(bat, /Unblock-File/);
    assert.equal(readFileSync(path.join(dir, OPEN_HINT_NAME), "utf8"), WINDOWS_HINT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("writeDesktopLaunchers makes the mac command executable", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "jingjian-launch-mac-"));
  try {
    writeDesktopLaunchers(dir, "darwin");
    const commandPath = path.join(dir, MAC_LAUNCHER_NAME);
    assert.equal(statSync(commandPath).mode & 0o111, 0o111);
    assert.match(readFileSync(commandPath, "utf8"), /xattr -dr com\.apple\.quarantine/);
    assert.equal(readFileSync(path.join(dir, OPEN_HINT_NAME), "utf8"), MAC_HINT);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
