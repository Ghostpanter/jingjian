# 静笺

专注写作的本地 Markdown 笔记。没有账号，没有打开 / 保存菜单，输入即写入这台设备。

适合平板分栏：左边是文件列表，右边直接写。点一篇笔记就开始编辑。

## 功能

- 左侧文件列表，按最后编辑时间分组；电子书按书名分章
- Markdown 源码、分栏、预览
- 代码高亮与 Mermaid 流程图
- 插入外链：Ctrl + K，或把网址粘到选中文字上
- 粘贴 / 拖入图片，可上传到图床
- 即时搜索标题和正文
- 新建 / 删除（删除前确认）
- 字数与自动保存
- 导出：PDF、HTML、HTML（不含样式）、图片、Word、OpenOffice、RTF、EPUB
- 电子书：左侧 + 导入 EPUB、阅读翻章、按章编辑后再导出
- 左侧 +：新建 Markdown / 纯文本，导入 Markdown、TXT、EPUB
- 主题：宣纸、墨夜、GitHub、GitHub 夜间，自定义浅色 / 深色
- 同步：静笺服务器、WebDAV、本机目录
- 键盘操作（`Ctrl+N` 新建，`Ctrl+,` 设置，`Ctrl+Shift+E` 导出，`?` 查看全部）

## 导出与电子书

工具栏下载按钮只负责导出，对应 Typora「通用」里框出的格式。新建和导入都在左侧 + 号。

每次导出会先打开系统对话框，选好位置后再生成文件。平板用系统「另存为」，电脑用保存对话框或浏览器下载。PDF / 图片 / HTML 会按预览排版导出，Mermaid 流程图会画成图，而不是源码。PDF 按段落和代码块分页；行内代码保持一整块，长命令会在代码块内换行，不会从单词中间裁开。

导入 EPUB、Markdown、TXT 后出现在侧栏。阅读页可翻章，铅笔即可改这一章，改完再「导出本书」。

## 主题

齿轮 → 主题。内置宣纸、墨夜、GitHub、GitHub 夜间。自定义浅色 / 深色可改纸色、字色、强调色。

## 图像 / 图床

齿轮 → 图像。插入时可选：无特殊操作、复制到本机、上传图片。

上传服务在应用内配置，不必另开 PicGo：

- GitHub（Token + `owner/repo`，链接可用 jsDelivr）
- Gitee
- SM.MS
- 兰空图床
- Imgur
- PicGo 接口（电脑本机 `http://127.0.0.1:36677/upload`）
- 自定义 HTTP 图床（文件字段与 JSON 路径可改）

也可把 PicGo 的 `data.json` 粘进「从 PicGo 配置导入」，平板无需安装 PicGo。

## 同步与同时编辑

侧栏齿轮打开设置里的「同步」。三种方式：

| 方式 | 适用 | 保存路径 |
| --- | --- | --- |
| 静笺服务器 | 自建 Docker | 宿主机目录 `JINGJIAN_NOTES_PATH` |
| WebDAV | 坚果云、Nextcloud、群晖、NAS | 远程目录，如 `/静笺` |
| 本机目录 | 电脑选文件夹，安卓写入文档目录 | 文件夹名，默认 `Jingjian` |

开着自动同步时，平板和电脑可以同时改同一篇云端笔记。正在编辑的这一篇不会被远端覆盖；停笔后几秒内会对齐。

冲突按最后修改时间对齐。远端目录里是带少量 frontmatter 的 `.md` 文件，可用 Typora 打开同一文件夹。

### 自建服务器（Docker）

```bash
cp .env.example .env
# 修改 JINGJIAN_TOKEN 和 JINGJIAN_NOTES_PATH
docker compose up -d --build
```

默认监听 `8787`。应用里填：

- 服务器地址：`http://<主机>:8787`
- Token：与 `.env` 里相同

指定保存路径示例：

```env
JINGJIAN_NOTES_PATH=/volume1/notes/jingjian
JINGJIAN_TOKEN=换成很长的随机串
```

健康检查：

```bash
curl -H "Authorization: Bearer 你的token" http://127.0.0.1:8787/health
```

局域网 HTTP 可用。公网请放在反向代理后面并开 HTTPS。

### 坚果云 WebDAV

- 地址：`https://dav.jianguoyun.com/dav/`
- 用户名：登录邮箱
- 密码：坚果云「账户信息」里的应用密码
- 远程保存路径：`/静笺`

## Android

安装包在 [Releases](https://github.com/Ghostpanter/jingjian/releases) 下载 `jingjian-v1.6.3.apk`。

包名 `com.ghostpanter.jingjian`。首次安装需允许「未知来源」。从旧版覆盖安装即可，本地笔记会保留。

## Windows / macOS / Linux

同一发布页提供桌面压缩包：

- `jingjian-v1.6.3-win-x64.zip`：解压后运行 `Jingjian.exe`（未签名，Windows 可能提示 SmartScreen，选仍要运行）
- `jingjian-v1.6.3-mac-x64.zip`：解压后打开 `Jingjian.app`（未签名，需在「隐私与安全性」允许）
- `jingjian-v1.6.3-linux-x64.zip`：解压后运行 `Jingjian`

桌面端与平板共用同一套同步。两边都打开自动同步后，可同时改云端同一篇笔记。

## 本地运行

需要 Node.js 22。

```bash
npm install
npm run dev
```

```bash
npm run typecheck
npm run build
npm run apk
npm run desktop:pack
```

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl + N` | 新建笔记 |
| `Ctrl + F` 或 `/` | 搜索 |
| `Ctrl + E` | 源码 / 分栏 / 预览 |
| `Ctrl + B` | 显示或收起文件列表 |
| `Ctrl + ,` | 设置（同步 / 主题 / 图像） |
| `Ctrl + K` | 插入外链 |
| `Ctrl + Shift + E` | 导出 |
| `Ctrl + Shift + Backspace` | 删除当前笔记 |
| `J` / `K` 或方向键 | 上一条 / 下一条 |
| `?` | 快捷键一览 |

## 许可

MIT
