#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = "/workspace";
const sdk = path.join(root, ".android-sdk");
const env = {
  ...process.env,
  ANDROID_SDK_ROOT: sdk,
  ANDROID_HOME: sdk,
  JAVA_HOME: process.env.JAVA_HOME || "/usr/lib/jvm/java-17-openjdk-amd64",
};

function patchCapacitorGradle() {
  const files = [
    "node_modules/@capacitor/android/capacitor/build.gradle",
    "node_modules/@capacitor/filesystem/android/build.gradle",
    "node_modules/@capacitor/keyboard/android/build.gradle",
    "node_modules/@capacitor/splash-screen/android/build.gradle",
    "node_modules/@capacitor/status-bar/android/build.gradle",
  ];
  for (const rel of files) {
    const file = path.join(root, rel);
    const text = readFileSync(file, "utf8");
    const next = text.replaceAll("proguard-android.txt", "proguard-android-optimize.txt");
    if (next !== text) writeFileSync(file, next);
  }
}

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

patchCapacitorGradle();
run("./gradlew", ["assembleRelease", "--no-daemon"], path.join(root, "android"));

const built = path.join(
  root,
  "android/app/build/outputs/apk/release/app-release.apk",
);
const destDir = path.join(root, "artifacts");
mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "jingjian-v1.7.14.apk");
copyFileSync(built, dest);
console.log(`APK_READY ${dest}`);
