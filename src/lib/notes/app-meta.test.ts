import assert from "node:assert/strict";
import { test } from "node:test";
import {
  APP_META,
  MIT_LICENSE,
  compareSemver,
  formatReleasedAt,
  hasNewerRelease,
  parseLatestRelease,
  stripVTag,
  versionLine,
} from "./app-meta.ts";

test("about meta has version, date, license and donate", () => {
  assert.match(APP_META.version, /^\d+\.\d+\.\d+$/);
  assert.match(APP_META.releasedAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(APP_META.license, "MIT");
  assert.match(MIT_LICENSE, /MIT License/);
  assert.match(MIT_LICENSE, /Ghostpanter/);
  assert.equal(APP_META.donateUrl, "https://github.com/sponsors/Ghostpanter");
  assert.match(versionLine(), new RegExp(APP_META.version));
  assert.match(versionLine(), /github\.com\/Ghostpanter\/jingjian/);
});

test("semver compare and latest release parse", () => {
  assert.equal(stripVTag("v1.7.4"), "1.7.4");
  assert.equal(compareSemver("1.7.4", "1.7.3"), 1);
  assert.equal(compareSemver("1.7.4", "1.7.4"), 0);
  assert.equal(compareSemver("1.7.4", "1.8.0"), -1);
  assert.equal(hasNewerRelease("1.7.4", "1.7.4"), false);
  assert.equal(hasNewerRelease("1.7.4", "1.7.5"), true);
  assert.equal(formatReleasedAt("2026-09-20"), "2026年9月20日");
  const parsed = parseLatestRelease({
    tag_name: "v1.7.5",
    html_url: "https://github.com/Ghostpanter/jingjian/releases/tag/v1.7.5",
  });
  assert.equal(parsed.version, "1.7.5");
  assert.match(parsed.url, /v1.7.5$/);
  assert.throws(() => parseLatestRelease({}), /无法检查更新/);
});
