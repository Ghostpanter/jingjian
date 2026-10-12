# 静笺 1.9.0（Flutter）

## 本版迁移
- **云同步**：自建 sync-server / WebDAV / 本地文件夹 / OSS·S3（含签名），设置页可测连接
- **文件夹树**：侧栏文件夹、新建/移动、电子书导入自动归入「电子书/书名」
- **笔记图谱**：`[[双向链接]]` 关系图，点击节点打开笔记
- **图片库**：导入图片、复制/插入 Markdown
- **博客发布**：GitHub / Gitee + Hugo / Hexo
- **电子书**：导入 TXT / HTML / EPUB，拆章为笔记
- **TTS 朗读**：系统 TTS 朗读正文
- **高级导出**：Markdown / 纯文本 / HTML / RTF（系统分享）
- **桌面 / Web**：已启用 `linux` / `windows` / `macos` / `web` 平台目录（按环境打包）
- **Mermaid**：优先加载内置 `assets/preview/mermaid.min.js`（离线）；失败时回退 CDN

## 仍简化 / 已知差异
- PDF / EPUB **导出**未做（旧版有）；本版导出到 HTML/RTF/MD
- MOBI 电子书未移植
- 同步附带图片 trailer 的完整二进制嵌入未完全对齐旧版（图库本地存储 + Markdown 引用可用）
- OSS 删除按文件名启发式匹配

## 技术
- 目录：`flutter_app/`
- 包名：`com.ghostpanter.jingjian`
- 版本：`1.9.0+190`
