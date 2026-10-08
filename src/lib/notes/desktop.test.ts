import assert from "node:assert/strict";
import { test } from "node:test";
import { desktopApi, desktopBodyFields, isDesktopApp } from "./desktop.ts";

test("desktop bridge is absent outside Electron", () => {
  assert.equal(isDesktopApp(), false);
  assert.equal(desktopApi(), undefined);
});

test("binary bodies travel as base64 instead of a string", async () => {
  const payload = await desktopBodyFields(new Blob([Uint8Array.from([1, 2, 3, 255])], { type: "image/png" }));
  assert.equal(payload.body, null);
  assert.equal(payload.bodyBase64, Buffer.from([1, 2, 3, 255]).toString("base64"));
  const text = await desktopBodyFields("hello");
  assert.equal(text.body, "hello");
  assert.equal(text.bodyBase64, null);
});
