#!/usr/bin/env bash
# 网页版构建：CanvasKit 等资源随包发布，不从 gstatic CDN 加载（离线/内网/国内可用）。
set -euo pipefail
cd "$(dirname "$0")/.."
flutter build web --release --no-web-resources-cdn "$@"
python3 tool/check_web_font.py 2>/dev/null || echo "WARN: web font coverage check failed or fonttools missing"
test -f build/web/canvaskit/canvaskit.wasm
test -f build/web/fonts/jj-cjk-sc.otf
echo "web OK: build/web"
