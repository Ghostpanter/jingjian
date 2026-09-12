import assert from "node:assert/strict";
import { test } from "node:test";
import { applyPicgoConfig, DEFAULT_IMAGE_CONFIG, formatImageSrc } from "./image-config.ts";

test("imports PicGo github config used by Typora", () => {
  const next = applyPicgoConfig(
    JSON.stringify({
      picBed: {
        current: "github",
        github: {
          repo: "Ghostpanter/pic",
          token: "ghp_example",
          path: "img/",
          branch: "main",
          customUrl: "https://img.example.com",
        },
      },
    }),
    { ...DEFAULT_IMAGE_CONFIG },
  );
  assert.equal(next.uploader, "github");
  assert.equal(next.insertAction, "upload");
  assert.equal(next.githubRepo, "Ghostpanter/pic");
  assert.equal(next.githubToken, "ghp_example");
  assert.equal(next.githubPath, "img");
  assert.equal(next.githubLink, "custom");
  assert.equal(next.githubDomain, "https://img.example.com");
});

test("imports smms / lsky / imgur from PicGo picBed", () => {
  const next = applyPicgoConfig(
    JSON.stringify({
      picBed: {
        uploader: "smms",
        smms: { token: "sm-token" },
        lskyPro: { serverUrl: "https://pic.example", token: "lsky-token" },
        imgur: { clientId: "abc123" },
      },
    }),
    { ...DEFAULT_IMAGE_CONFIG },
  );
  assert.equal(next.uploader, "smms");
  assert.equal(next.smmsToken, "sm-token");
  assert.equal(next.lskyUrl, "https://pic.example");
  assert.equal(next.imgurClientId, "abc123");
});

test("formatImageSrc respects relative and escape options", () => {
  const src = formatImageSrc("images/a.png", {
    ...DEFAULT_IMAGE_CONFIG,
    preferRelative: true,
    relativeDotSlash: true,
    escapeUrl: false,
  });
  assert.equal(src, "./images/a.png");
});
