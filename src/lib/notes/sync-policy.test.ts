import assert from "node:assert/strict";
import test from "node:test";
import { shouldRunSync, type SyncTrigger } from "./sync-policy.ts";

test("manual save and sync-now always run when a provider is on", () => {
  assert.equal(
    shouldRunSync({ provider: "webdav", autoSync: false, trigger: "manual-save" }),
    true,
  );
  assert.equal(
    shouldRunSync({ provider: "oss", autoSync: false, trigger: "manual" }),
    true,
  );
  assert.equal(
    shouldRunSync({ provider: "off", autoSync: true, trigger: "manual-save" }),
    false,
  );
});

test("auto sync only on edit state change and background", () => {
  const allowed: SyncTrigger[] = ["edit-enter", "edit-leave", "background"];
  const blocked: SyncTrigger[] = ["interval", "notes-change", "foreground", "startup"];
  for (const trigger of allowed) {
    assert.equal(shouldRunSync({ provider: "server", autoSync: true, trigger }), true, trigger);
  }
  for (const trigger of blocked) {
    assert.equal(shouldRunSync({ provider: "server", autoSync: true, trigger }), false, trigger);
  }
});

test("auto-sync off blocks edit and background triggers", () => {
  assert.equal(
    shouldRunSync({ provider: "folder", autoSync: false, trigger: "edit-leave" }),
    false,
  );
  assert.equal(
    shouldRunSync({ provider: "folder", autoSync: false, trigger: "background" }),
    false,
  );
});
