import assert from "node:assert/strict";
import { test } from "node:test";
import { clampSidebarWidth, shouldCollapseSidebar, sidebarWidthMax } from "./sidebar-width.ts";

test("sidebar width stays inside the usable range", () => {
  assert.equal(clampSidebarWidth(80, 1200), 200);
  assert.equal(clampSidebarWidth(900, 1200), sidebarWidthMax(1200));
  assert.equal(clampSidebarWidth(320, 1200), 320);
});

test("a drag that is too narrow closes the sidebar", () => {
  assert.equal(shouldCollapseSidebar(120), true);
  assert.equal(shouldCollapseSidebar(200), false);
});
