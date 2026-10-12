# 静笺 Flutter（1.9.0）

原生 Flutter 客户端：编辑 / Markdown 预览 / 公式 / Mermaid，以及同步、文件夹树、图谱、图库、博客、电子书、TTS、导出。

## 平台
- Android（正式签名 APK）
- Linux / Windows / macOS / Web（`flutter create` 已启用平台目录）

## 开发
```bash
cd flutter_app
flutter pub get
flutter run -d android   # 或 linux / chrome
flutter test
flutter build apk --release
```

签名属性读取 `/workspace/secrets/jingjian-key.properties`（本地勿提交）。

详见 `RELEASE_NOTES.md`。
