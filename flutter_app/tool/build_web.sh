#!/usr/bin/env bash
# 网页版构建：CanvasKit 等资源随包发布，不从 gstatic CDN 加载（离线/内网/国内可用）。
set -euo pipefail
cd "$(dirname "$0")/.."
flutter build web --release --no-web-resources-cdn "$@"
test -f build/web/canvaskit/canvaskit.wasm
test -f build/web/fonts/jj-cjk-sc.otf
echo "web OK: build/web"
