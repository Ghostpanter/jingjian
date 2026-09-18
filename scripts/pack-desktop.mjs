#!/usr/bin/env node
import { packager } from "@electron/packager";
import { createRequire } from "node:module";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { writeDesktopLaunchers } from "./desktop-launchers.mjs";

const require = createRequire(import.meta.url);
const root = path.resolve(".");
const staging = path.join(root, ".desktop-stage");
const outDir = path.join(os.tmpdir(), "jingjian-desktop");
const artifacts = path.join(root, "artifacts");
const version = "1.7.2";
const electronVersion = require("electron/package.json").version;

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function commandExists(command) {
  const result = spawnSync("bash", ["-lc", `command -v ${command}`], { encoding: "utf8" });
  return result.status === 0 && Boolean(result.stdout?.trim());
}

function signWindowsIfConfigured(winDir) {
  const cert = process.env.WIN_CSC_FILE?.trim();
  const password = process.env.WIN_CSC_PASSWORD ?? "";
  if (!cert) return;
  if (!existsSync(cert)) {
    console.warn(`WIN_CSC_FILE not found: ${cert}`);
    return;
  }
  if (!commandExists("osslsigncode")) {
    console.warn("osslsigncode missing; skip Windows Authenticode");
    return;
  }
  const exe = path.join(winDir, "Jingjian.exe");
  const signed = `${exe}.signed`;
  const args = [
    "sign",
    "-pkcs12",
    cert,
    "-n",
    "静笺",
    "-i",
    "https://github.com/Ghostpanter/jingjian",
    "-t",
    "http://timestamp.digicert.com",
    "-in",
    exe,
    "-out",
    signed,
  ];
  if (password) args.splice(4, 0, "-pass", password);
  const result = spawnSync("osslsigncode", args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0 || !existsSync(signed)) {
    console.warn("Windows Authenticode signing failed");
    return;
  }
  rmSync(exe, { force: true });
  cpSync(signed, exe);
  rmSync(signed, { force: true });
  console.log("signed Jingjian.exe");
}

function signMacIfConfigured(appPath) {
  const cert = process.env.APPLE_CSC_FILE?.trim();
  const password = process.env.APPLE_CSC_PASSWORD ?? "";
  if (!cert) return;
  if (!existsSync(cert)) {
    console.warn(`APPLE_CSC_FILE not found: ${cert}`);
    return;
  }
  if (!commandExists("rcodesign")) {
    console.warn("rcodesign missing; skip macOS Developer ID signing");
    return;
  }
  const args = ["sign", "--p12-file", cert, "--code-signature-flags", "runtime", appPath];
  if (password) args.splice(3, 0, "--p12-password", password);
  const result = spawnSync("rcodesign", args, { cwd: root, stdio: "inherit" });
  if (result.status !== 0) {
    console.warn("macOS signing failed");
    return;
  }
  console.log("signed Jingjian.app");
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
    if name.endswith(".command"):
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
const icoPath = path.join(staging, "icon.ico");
const icnsPath = path.join(staging, "icon.icns");
const pngIcon = path.join(staging, "icon.png");
if (existsSync(pngIcon)) {
  const iconScript = `
import struct, sys
from pathlib import Path
png = Path(sys.argv[1]).read_bytes()
header = struct.pack("<HHH", 0, 1, 1)
entry = struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32, len(png), 22)
Path(sys.argv[2]).write_bytes(header + entry + png)
# ic09 = 512x512 PNG inside ICNS
body = b"ic09" + struct.pack(">I", 8 + len(png)) + png
Path(sys.argv[3]).write_bytes(b"icns" + struct.pack(">I", 8 + len(body)) + body)
`;
  spawnSync("python3", ["-c", iconScript, pngIcon, icoPath, icnsPath], { stdio: "inherit" });
}
writeFileSync(
  path.join(staging, "package.json"),
  JSON.stringify(
    {
      name: "jingjian",
      productName: "Jingjian",
      version,
      type: "module",
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
const pngIconPath = existsSync(pngIcon) ? pngIcon : undefined;
const winIcon = existsSync(icoPath) ? icoPath : pngIconPath;
const macIcon = existsSync(icnsPath) ? icnsPath : pngIconPath;

const macExtendInfo = {
  CFBundleDisplayName: "静笺",
  CFBundleName: "静笺",
  CFBundleDocumentTypes: [
    {
      CFBundleTypeName: "Markdown",
      CFBundleTypeRole: "Editor",
      LSHandlerRank: "Alternate",
      CFBundleTypeExtensions: ["md", "markdown", "txt"],
      CFBundleTypeMIMETypes: ["text/markdown", "text/x-markdown", "text/plain"],
    },
    {
      CFBundleTypeName: "EPUB",
      CFBundleTypeRole: "Viewer",
      LSHandlerRank: "Alternate",
      CFBundleTypeExtensions: ["epub"],
      CFBundleTypeMIMETypes: ["application/epub+zip"],
    },
  ],
};

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
      // Unpack the SPA so jingjian:// and file:// both get real JS/CSS files.
      asar: false,
      name: "Jingjian",
      appVersion: version,
      appCopyright: "Ghostpanter",
      appBundleId: "com.ghostpanter.jingjian",
      appCategoryType: "public.app-category.productivity",
      electronVersion,
      icon: platform === "win32" ? winIcon : platform === "darwin" ? macIcon : pngIconPath,
      extendInfo: platform === "darwin" ? macExtendInfo : undefined,
      darwinDarkModeSupport: true,
      win32metadata: {
        CompanyName: "Ghostpanter",
        FileDescription: "静笺",
        ProductName: "静笺",
        InternalName: "Jingjian",
        OriginalFilename: "Jingjian.exe",
      },
      quiet: false,
      ignore: [/node_modules/, /\.map$/],
    });
  } catch (error) {
    console.warn(`pack ${platform} failed:`, error instanceof Error ? error.message : error);
  }
}

const linuxDir = path.join(outDir, "Jingjian-linux-x64");
if (existsSync(linuxDir)) {
  writeFileSync(
    path.join(linuxDir, "jingjian.desktop"),
    `[Desktop Entry]
Type=Application
Name=静笺
GenericName=Markdown Notes
Comment=本地 Markdown 笔记
Exec=Jingjian %F
Icon=jingjian
Terminal=false
Categories=Office;TextEditor;
MimeType=text/markdown;text/x-markdown;text/plain;application/epub+zip;
StartupWMClass=Jingjian
`,
  );
  const bundledIcon = path.join(linuxDir, "resources", "app", "icon.png");
  if (existsSync(bundledIcon)) {
    cpSync(bundledIcon, path.join(linuxDir, "jingjian.png"));
  }
}

const darwinPlist = path.join(
  outDir,
  "Jingjian-darwin-x64/Jingjian.app/Contents/Info.plist",
);
if (existsSync(darwinPlist)) {
  // Packager overwrites display name from ASCII `name`; keep Finder title in Chinese.
  const patched = readFileSync(darwinPlist, "utf8")
    .replace(
      /<key>CFBundleDisplayName<\/key>\s*<string>Jingjian<\/string>/,
      "<key>CFBundleDisplayName</key>\n    <string>静笺</string>",
    )
    .replace(
      /<key>CFBundleName<\/key>\s*<string>Jingjian<\/string>/,
      "<key>CFBundleName</key>\n    <string>静笺</string>",
    );
  writeFileSync(darwinPlist, patched);
}

const winDir = path.join(outDir, "Jingjian-win32-x64");
if (existsSync(winDir)) {
  writeDesktopLaunchers(winDir, "win32");
  signWindowsIfConfigured(winDir);
}

const darwinDir = path.join(outDir, "Jingjian-darwin-x64");
if (existsSync(darwinDir)) {
  writeDesktopLaunchers(darwinDir, "darwin");
  signMacIfConfigured(path.join(darwinDir, "Jingjian.app"));
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
