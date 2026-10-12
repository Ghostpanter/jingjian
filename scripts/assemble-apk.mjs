#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Repo root, wherever the checkout lives.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const sdk =
  process.env.ANDROID_HOME ||
  process.env.ANDROID_SDK_ROOT ||
  [path.join(root, ".android-sdk"), path.join(root, "..", ".android-sdk")].find((dir) => existsSync(dir));
if (!sdk) {
  console.error("Set ANDROID_HOME (or ANDROID_SDK_ROOT) to the Android SDK.");
  process.exit(1);
}
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

const outputs = path.join(root, "android/app/build/outputs/apk/release");
const signed = path.join(outputs, "app-release.apk");
const destDir = path.join(root, "artifacts");
mkdirSync(destDir, { recursive: true });
if (existsSync(signed)) {
  const dest = path.join(destDir, `jingjian-v${version}.apk`);
  copyFileSync(signed, dest);
  console.log(`APK_READY ${dest}`);
} else {
  // No android/key.properties: Gradle leaves an unsigned build. Never publish it.
  const dest = path.join(destDir, `jingjian-v${version}-unsigned.apk`);
  copyFileSync(path.join(outputs, "app-release-unsigned.apk"), dest);
  console.warn(`android/key.properties is missing, so this APK is UNSIGNED and cannot be released: ${dest}`);
}
