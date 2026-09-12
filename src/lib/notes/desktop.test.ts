import assert from "node:assert/strict";
import { test } from "node:test";
import { desktopApi, isDesktopApp } from "./desktop.ts";

test("desktop bridge is absent outside Electron", () => {
  assert.equal(isDesktopApp(), false);
  assert.equal(desktopApi(), undefined);
});
