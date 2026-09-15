#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = "/workspace";
const sdk = path.join(root, ".android-sdk");
const env = {
  ...process.env,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_HOME: sdk,
  JAVA_HOME: process.env.JAVA_HOME || "/usr/lib/jvm/java-17-openjdk-amd64",
};

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

run("./gradlew", ["assembleRelease", "--no-daemon"], path.join(root, "android"));

const built = path.join(
  root,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const destDir = path.join(root, "artifacts");
mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "jingjian-v1.6.16.apk");
copyFileSync(built, dest);
console.log(`APK_READY ${dest}`);
