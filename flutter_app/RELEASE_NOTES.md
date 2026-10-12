# 静笺 1.8.0（Flutter）

旧版 Web / Capacitor / Electron 已有能力的 **Flutter 重构**（非新功能大版本）。包名 `com.ghostpanter.jingjian`，可覆盖安装。

## 本版包含
- 本地笔记：列表、搜索、新建、回收站、星标
- **原生** Markdown 编辑（系统中文输入法）与预览（GFM）
- **flutter_math_fork** 公式；**Mermaid** 小块 WebView（优先内置 JS，失败回退 CDN）
- **云同步**：自建 sync-server / WebDAV / 本地文件夹 / OSS·S3
- **文件夹树**、**笔记图谱**（`[[双向链接]]`）
- **图片库**、**博客发布**（GitHub / Gitee · Hugo / Hexo）
- **电子书导入**（TXT / HTML / EPUB）、**TTS 朗读**
- **导出**：Markdown / 纯文本 / HTML / RTF
- 桌面（linux / windows / macos）与 Web 平台目录已启用

## 相对旧版的简化
- 未做 PDF / EPUB 导出、MOBI 导入
- 同步附带图片 trailer 未完全对齐旧版（图库本地存储 + Markdown 引用可用）

## 版本说明
- 显示版本 **1.8.0**（`1.8.0+181`）；曾误标为 1.9.0 的预览已收回本线
