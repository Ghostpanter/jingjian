import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { planDedupe } from "./dedupe.mjs";

test("dedupe keeps the plain original and lists frontmatter copies", async () => {
  const d = mkdtempSync(path.join(tmpdir(), "jjdd"));
  writeFileSync(path.join(d, "读书.md"), "# 读书\nhi\n");
  writeFileSync(path.join(d, "读书.aaaa1111.md"), "---\nid: a\ncreatedAt: 1\nupdatedAt: 2\n---\n# 读书\nhi\n");
  writeFileSync(path.join(d, "读书.bbbb2222.md"), "---\nid: b\ncreatedAt: 1\nupdatedAt: 3\n---\n# 读书\r\nhi");
  writeFileSync(path.join(d, "别的.cccc.md"), "---\nid: c\n---\n# 别的");
  const plan = await planDedupe(d);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].keep, "读书.md");
  assert.deepEqual(plan[0].remove.sort(), ["读书.aaaa1111.md", "读书.bbbb2222.md"]);
});
