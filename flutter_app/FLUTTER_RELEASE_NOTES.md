# 静笺 1.8.0（Flutter Android）

## 本版包含
- 本地笔记列表、搜索、新建
- Markdown 源码编辑（系统中文输入法）
- 预览（GFM：标题/列表/任务/表格/代码块）
- KaTeX 公式与 Mermaid 图（预览 WebView + CDN）
- 回收站（恢复 / 彻底删除）
- 分栏 / 纯编辑 / 纯预览切换
- 包名 `com.ghostpanter.jingjian`（可覆盖安装升级）

## 暂缓 / 未移植（仍可用旧版 Web/Electron/APK 功能）
- 云同步（自建 sync-server / WebDAV / OSS）
- 桌面 Electron、Web 端
- 图关系、博客发布、电子书阅读、TTS
- 文件夹树、图片库、导出 PDF/EPUB 等高级能力
- 离线打包的 Mermaid/KaTeX（当前预览需网络加载 CDN；无网时仍可编辑源码）

## 技术说明
- 代码目录：`flutter_app/`
- 分支：`feature/flutter-1.8.0`
