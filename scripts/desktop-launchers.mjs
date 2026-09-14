import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";

export const WINDOWS_LAUNCHER_NAME = "打开静笺.bat";
export const MAC_LAUNCHER_NAME = "打开静笺.command";
export const OPEN_HINT_NAME = "打开静笺.txt";

export const WINDOWS_LAUNCHER = `@echo off
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-ChildItem -LiteralPath '%~dp0' -Recurse -Force -ErrorAction SilentlyContinue | Unblock-File -ErrorAction SilentlyContinue"
start "" "%~dp0Jingjian.exe"
`;

export const MAC_LAUNCHER = `#!/bin/bash
cd "$(dirname "$0")"
DIR="$(pwd)"
xattr -dr com.apple.quarantine "$DIR" >/dev/null 2>&1 || true
open "$DIR/Jingjian.app"
`;

export const WINDOWS_HINT = `解压后请双击「打开静笺.bat」，不要直接点 Jingjian.exe。

脚本会清掉浏览器下载留下的「来自互联网」标记，然后启动静笺。只需这一次。之后可直接运行 Jingjian.exe，或把 bat 发到任务栏。
`;

export const MAC_HINT = `解压后请双击「打开静笺.command」，不要直接点「静笺」。

若提示无法打开：按住 Control 再点该文件，选「打开」。脚本会清掉隔离属性，然后启动。只需这一次。之后可直接点「静笺」。

也可在终端执行：

xattr -cr "Jingjian.app" && open "Jingjian.app"
`;

export function writeDesktopLaunchers(appDir, platform) {
  if (platform === "win32") {
    writeFileSync(path.join(appDir, WINDOWS_LAUNCHER_NAME), WINDOWS_LAUNCHER.replaceAll("\n", "\r\n"));
    writeFileSync(path.join(appDir, OPEN_HINT_NAME), WINDOWS_HINT);
    return;
  }
  if (platform === "darwin") {
    const commandPath = path.join(appDir, MAC_LAUNCHER_NAME);
    writeFileSync(commandPath, MAC_LAUNCHER);
    chmodSync(commandPath, 0o755);
    writeFileSync(path.join(appDir, OPEN_HINT_NAME), MAC_HINT);
  }
}
