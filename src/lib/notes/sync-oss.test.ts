import assert from "node:assert/strict";
import { test } from "node:test";
import {
  endpointForVendor,
  ossBucketUrl,
  ossObjectKey,
  ossUsesPathStyle,
  parseListKeys,
  patchOssVendor,
} from "./sync-oss.ts";
import { DEFAULT_SYNC_CONFIG } from "./sync-types.ts";

test("vendor endpoints follow each operator", () => {
  assert.equal(endpointForVendor("aliyun", "cn-shanghai"), "oss-cn-shanghai.aliyuncs.com");
  assert.equal(endpointForVendor("tencent", "ap-beijing"), "cos.ap-beijing.myqcloud.com");
  assert.equal(endpointForVendor("huawei", "cn-east-3"), "obs.cn-east-3.myhuaweicloud.com");
  assert.equal(endpointForVendor("qiniu", "cn-east-1"), "s3.cn-east-1.qiniucs.com");
  assert.equal(endpointForVendor("volcengine", "cn-beijing"), "tos-cn-beijing.volces.com");
  assert.equal(endpointForVendor("aws", "us-west-2"), "s3.us-west-2.amazonaws.com");
});

test("virtual-hosted bucket url for aliyun, path-style for minio", () => {
  const aliyun = {
    ...DEFAULT_SYNC_CONFIG,
    ...patchOssVendor("aliyun", DEFAULT_SYNC_CONFIG),
    ossBucket: "jingjian-notes",
  };
  assert.equal(ossUsesPathStyle(aliyun), false);
  assert.equal(
    ossBucketUrl(aliyun),
    "https://jingjian-notes.oss-cn-hangzhou.aliyuncs.com",
  );
  const minio = {
    ...DEFAULT_SYNC_CONFIG,
    ...patchOssVendor("minio", DEFAULT_SYNC_CONFIG),
    ossEndpoint: "http://192.168.1.8:9000",
    ossBucket: "notes",
    ossPathStyle: true,
  };
  assert.equal(ossUsesPathStyle(minio), true);
  assert.equal(ossBucketUrl(minio), "http://192.168.1.8:9000/notes");
  assert.equal(ossObjectKey(aliyun, "窗边.abcd1234.md"), "jingjian/窗边.abcd1234.md");
});

test("parses S3 list XML keys and continuation", () => {
  const xml = `<?xml version="1.0"?>
<ListBucketResult>
  <IsTruncated>true</IsTruncated>
  <Contents><Key>jingjian/a.md</Key></Contents>
  <Contents><Key>jingjian/窗边.md</Key></Contents>
  <NextContinuationToken>abc&amp;1</NextContinuationToken>
</ListBucketResult>`;
  const parsed = parseListKeys(xml);
  assert.deepEqual(parsed.keys, ["jingjian/a.md", "jingjian/窗边.md"]);
  assert.equal(parsed.token, "abc&1");
});
