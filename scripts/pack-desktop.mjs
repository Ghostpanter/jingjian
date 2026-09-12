#!/usr/bin/env node
import { packager } from "@electron/packager";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const root = path.resolve(".");
const staging = path.join(root, ".desktop-stage");
const outDir = path.join(os.tmpdir(), "jingjian-desktop");
const artifacts = path.join(root, "artifacts");
const version = "1.6.2";
const electronVersion = require("electron/package.json").version;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function zipFolder(sourceDir, zipPath) {
  const script = `
import datetime, os, stat, zipfile
from pathlib import Path
src = Path(${JSON.stringify(sourceDir)})
dest = Path(${JSON.stringify(zipPath)})
base = src.parent
if dest.exists():
    dest.unlink()
dest.parent.mkdir(parents=True, exist_ok=True)

def is_exec(path: Path) -> bool:
    name = path.name
    parts = set(path.parts)
    if name in {"Jingjian", "Jingjian.exe", "chrome-sandbox", "chrome_crashpad_handler"}:
        return True
    if path.suffix in {".so", ".dylib", ".sh"}:
        return True
    if "MacOS" in parts or name.endswith(" Helper") or "Helper.app" in str(path):
        return True
    try:
        return bool(path.stat().st_mode & 0o111)
    except OSError:
        return False

with zipfile.ZipFile(dest, "w", compression=zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
    for path in sorted(src.rglob("*"), key=lambda p: str(p)):
        rel = path.relative_to(base).as_posix()
        if path.is_symlink():
            info = zipfile.ZipInfo(filename=rel)
            info.create_system = 3
            info.external_attr = (0o120755 & 0xFFFF) << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            zf.writestr(info, os.readlink(path))
            continue
        if path.is_dir():
            continue
        info = zipfile.ZipInfo(filename=rel)
        st = path.stat()
        dt = datetime.datetime.fromtimestamp(st.st_mtime)
        info.date_time = (dt.year, dt.month, dt.day, dt.hour, dt.minute, dt.second)
        mode = 0o100755 if is_exec(path) else 0o100644
        info.external_attr = (mode & 0xFFFF) << 16
        info.create_system = 3
        info.compress_type = zipfile.ZIP_DEFLATED
        zf.writestr(info, path.read_bytes())
print("ZIP_READY", dest, dest.stat().st_size)
`;
  const result = spawnSync("python3", ["-c", script], { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.warn(`zip ${zipPath} failed`);
    return false;
  }
  return existsSync(zipPath);
}

run("npx", ["vite", "build", "--config", "vite.android.config.ts"]);

rmSync(staging, { recursive: true, force: true });
mkdirSync(path.join(staging, "www"), { recursive: true });
cpSync(path.join(root, "android-www"), path.join(staging, "www"), { recursive: true });
cpSync(path.join(root, "desktop", "main.mjs"), path.join(staging, "main.mjs"));
cpSync(path.join(root, "desktop", "preload.cjs"), path.join(staging, "preload.cjs"));
if (existsSync(path.join(root, "public/icon-512.png"))) {
  cpSync(path.join(root, "public/icon-512.png"), path.join(staging, "icon.png"));
}
writeFileSync(
  path.join(staging, "package.json"),
  JSON.stringify(
    {
      name: "jingjian",
      productName: "Jingjian",
      version,
      main: "main.mjs",
      author: "Ghostpanter",
      license: "MIT",
    },
    null,
    2,
  ),
);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
mkdirSync(artifacts, { recursive: true });
const icon = existsSync(path.join(staging, "icon.png"))
  ? path.join(staging, "icon.png")
  : undefined;

const platforms = ["linux", "win32", "darwin"];
for (const platform of platforms) {
  console.log(`pack ${platform} electron ${electronVersion}`);
  try {
    await packager({
      dir: staging,
      out: outDir,
      overwrite: true,
      platform,
      arch: "x64",
      asar: true,
      name: "Jingjian",
      appVersion: version,
      appCopyright: "Ghostpanter",
      electronVersion,
      icon,
      quiet: false,
      ignore: [/node_modules/, /\.map$/],
    });
  } catch (error) {
    console.warn(`pack ${platform} failed:`, error instanceof Error ? error.message : error);
  }
}

const zips = [
  ["Jingjian-linux-x64", `jingjian-v${version}-linux-x64.zip`],
  ["Jingjian-win32-x64", `jingjian-v${version}-win-x64.zip`],
  ["Jingjian-darwin-x64", `jingjian-v${version}-mac-x64.zip`],
];
for (const [folder, zipName] of zips) {
  const source = path.join(outDir, folder);
  if (!existsSync(source)) {
    console.warn(`missing ${source}`);
    continue;
  }
  zipFolder(source, path.join(artifacts, zipName));
}

console.log(`DESKTOP_READY ${outDir}`);
