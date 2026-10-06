import assert from "node:assert/strict";
import { test } from "node:test";
import { isPrivateNetworkHost } from "./private-net.ts";

test("private network hosts are lan addresses, not localhost or the public web", () => {
  assert.equal(isPrivateNetworkHost("http://192.168.1.8:5000/dav"), true);
  assert.equal(isPrivateNetworkHost("10.0.0.2"), true);
  assert.equal(isPrivateNetworkHost("https://172.16.8.4/blog"), true);
  assert.equal(isPrivateNetworkHost("http://nas.local"), true);
  assert.equal(isPrivateNetworkHost("http://127.0.0.1:8787"), false);
  assert.equal(isPrivateNetworkHost("https://example.com"), false);
  assert.equal(isPrivateNetworkHost(""), false);
});
