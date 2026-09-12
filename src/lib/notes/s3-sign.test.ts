import assert from "node:assert/strict";
import { test } from "node:test";
import {
  amzDate,
  canonicalUri,
  encodeS3Path,
  rfc3986,
  sha256Hex,
  signS3Request,
} from "./s3-sign.ts";

test("encodes S3 path segments but keeps slashes", () => {
  assert.equal(encodeS3Path("jingjian/窗边.md"), `jingjian/${rfc3986("窗边.md")}`);
  assert.equal(canonicalUri("/jingjian/a b.md"), "/jingjian/a%20b.md");
});

test("empty body hash is the SHA-256 of empty string", async () => {
  assert.equal(
    await sha256Hex(""),
    "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  );
});

test("signs a GET with deterministic date", async () => {
  const now = new Date("2013-05-24T00:00:00.000Z");
  const signed = await signS3Request({
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    now,
  });
  assert.equal(amzDate(now), "20130524T000000Z");
  assert.match(signed.headers.authorization, /^AWS4-HMAC-SHA256 Credential=/);
  assert.match(signed.headers.authorization, /SignedHeaders=host;x-amz-content-sha256;x-amz-date/);
  assert.equal(signed.headers["x-amz-date"], "20130524T000000Z");
  assert.equal(signed.payloadHash.length, 64);
  const again = await signS3Request({
    method: "GET",
    url: "https://examplebucket.s3.amazonaws.com/test.txt",
    accessKey: "AKIAIOSFODNN7EXAMPLE",
    secretKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    region: "us-east-1",
    now,
  });
  assert.equal(signed.headers.authorization, again.headers.authorization);
});
