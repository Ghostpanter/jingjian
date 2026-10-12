import assert from "node:assert/strict";
import { test } from "node:test";
import {
  filesFromDataUrls,
  imageDataUrlsFromHtml,
  shouldInsertClipboardImages,
} from "./image-insert.ts";

test("imageDataUrlsFromHtml pulls data: image sources", () => {
  const html =
    '<meta charset="utf-8"><img src="data:image/png;base64,aGVsbG8=" alt="shot"><p>x</p>';
  const urls = imageDataUrlsFromHtml(html);
  assert.equal(urls.length, 1);
  assert.match(urls[0]!, /^data:image\/png;base64,aGVsbG8=$/);
});

test("imageDataUrlsFromHtml ignores http images and dedupes", () => {
  const html =
    '<img src="https://example.com/a.png"><img SRC="data:image/jpeg;base64,YWJj"><img src="data:image/jpeg;base64,YWJj">';
  assert.deepEqual(imageDataUrlsFromHtml(html), ["data:image/jpeg;base64,YWJj"]);
});

test("shouldInsertClipboardImages prefers files and short plain captions", () => {
  const withFile = {
    getData: () => "screenshot.png",
  } as unknown as DataTransfer;
  assert.equal(shouldInsertClipboardImages(withFile, [new File([], "a.png", { type: "image/png" })], []), true);

  const htmlOnly = {
    getData: (type: string) => (type === "text/plain" ? "" : ""),
  } as unknown as DataTransfer;
  assert.equal(shouldInsertClipboardImages(htmlOnly, [], ["data:image/png;base64,AA"]), true);

  const richText = {
    getData: (type: string) =>
      type === "text/plain" ? "A long paragraph that should stay as text paste.\nSecond line.".repeat(2) : "",
  } as unknown as DataTransfer;
  assert.equal(shouldInsertClipboardImages(richText, [], ["data:image/png;base64,AA"]), false);
});

test("filesFromDataUrls builds image Files", async () => {
  const files = await filesFromDataUrls(["data:image/png;base64,aGVsbG8="]);
  assert.equal(files.length, 1);
  assert.match(files[0]!.type, /^image\//);
  assert.ok(files[0]!.size > 0);
});
