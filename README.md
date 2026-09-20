# 静笺

专注写作的本地 Markdown 笔记。没有账号。笔记写在应用里，切到后台且正文有改动时会保存到系统「文档/jingjian」。

适合平板分栏：左边是文件列表，右边直接写。点一篇笔记就开始编辑。手机竖屏用侧栏抽屉，横屏即使宽度不够也按平板来。

## 功能

- 左侧文件列表按文件夹树排列，电子书仍按书名分章；长按笔记可拖进或拖出文件夹，松手不移动则删除或移到根目录；长按文件夹可删除或导出
- 新建文件夹会在系统文档 `jingjian` 目录落盘
- 手动保存 / 另存为；切到其他应用时，正文有改动才自动保存
- 当前文档查找与替换，支持正则、区分大小写、全词匹配
- 侧栏右缘向左拖可关掉文件列表；目录和大纲之间可拖动高度
- Markdown 源码、分栏、预览；`Ctrl + /` 或 `Ctrl + E` 循环切换；分栏时两边按标题对齐同步滚动
- 公式 `$...$` / `$$...$$`，任务列表可在预览勾选，代码块可复制，支持 Callout、脚注、`[[笔记名]]` 双链
- `Ctrl + P` 按标题快速打开；删除进回收站；侧栏可按修改时间、创建时间、标题排序
- 当前笔记的标题大纲，点一下跳到源码和预览对应位置
- 代码高亮与 Mermaid 流程图
- 插入外链：Ctrl + K，或把网址粘到选中文字上
- 粘贴 / 拖入图片，可上传到图床
- 侧栏搜索标题和正文；文档内搜索用 Ctrl + F
- 新建 / 删除（删除前确认）
- 导出：PDF、HTML、HTML（不含样式）、图片、Word、OpenOffice、RTF、EPUB
- 电子书：侧栏单独成「书」，点书名展开或收起章节，点阅读从上次章节和位置接着看；划线摘到「摘录」；阅读页可朗读（只在电子书阅读时出现，用系统语音；中英可混读，专业词按单词而不是字母。读完本章默认接着下一章，长段会滚到正在读的句子。齿轮 → 朗读 可选语种、音色和自动播放）。导入 EPUB、Kindle、FB2、带章节的 TXT 或 HTML，按目录分章；导出带作者和封面。点章节仍打开 Markdown
- 左侧 +：新建 Markdown / 纯文本 / 文件夹，导入 Markdown、TXT、文件夹或电子书（EPUB、Kindle、FB2、带章节的 TXT、HTML）。导入文件夹走系统选文件夹，不再误选成里面的文件
- 主题：宣纸、墨夜、GitHub、GitHub 夜间，自定义浅色 / 深色。代码高亮用独立配色，宣纸浅底也能看清
- 关于：齿轮 → 关于，可看版本、更新日期、MIT 协议、检查更新、源代码、问题反馈和捐赠
- 同步：静笺服务器、WebDAV、本机目录、对象存储（阿里云 OSS / 腾讯云 COS / 华为 OBS / 七牛 Kodo / 火山 TOS / Amazon S3 / MinIO）
- 博客：齿轮 → 博客，选 GitHub 或 Gitee。侧栏报纸图标列出仓库文章，点开可读、可拉进本地再改；工具栏纸飞机发回去。新建可用日记 / 会议 / 博客文章模板
- 安卓：系统「用其他应用打开」可选静笺，直接打开 Markdown、TXT、EPUB、Kindle、FB2；分享文字或图片也会收入笔记
- 手机竖屏：文件列表从左侧滑出，点遮罩关闭；横屏即使宽度不够也按平板显示侧栏
- 打开数兆的 TXT / Markdown 不会卡死：预览只渲染开头，超大正文写入独立缓存
- 系统状态栏透明叠在界面上：侧栏和编辑区各自的颜色顶到状态栏后面，时间、电量不再浮在一条错色的空边上

## 导出与电子书

工具栏下载按钮只负责导出，对应 Typora「通用」里框出的格式。新建和导入都在左侧 + 号。

每次导出会先打开系统对话框，选好位置后再生成文件。平板用系统「另存为」，电脑用保存对话框或浏览器下载。PDF / 图片 / HTML 会按预览排版导出，Mermaid 流程图会画成图，而不是源码。PDF 里流程图整张落在一页内，过长会等比缩小，不会从中间切开。PDF 按段落和代码块分页；行内代码保持一整块，长命令会在代码块内换行，不会从单词中间裁开。

导入 EPUB、Kindle（MOBI / AZW / AZW3）、FB2、带章节的 TXT、HTML 或整个文件夹后出现在侧栏。文件夹会按原来的相对路径挂到目录树里；带「第 X 章」这类标题的 TXT 会当成电子书，普通 TXT 仍是笔记。电子书在「书」里，点书名展开章节、再点可收起，下面的 Markdown 笔记就能翻到。阅读页记住章节和章内位置，并随同步走；划线可摘成笔记。导入会尽量保留表格、列表和脚注。导出 EPUB 带作者与封面。部分较新的 Kindle 书若打不开，可先转成 EPUB 再导入。

## 主题

齿轮 → 主题。内置宣纸、墨夜、GitHub、GitHub 夜间。自定义浅色 / 深色可改纸色、字色、强调色。宣纸是默认：代码关键字、字符串、函数用独立高对比配色，不再混进正文。要整体最清楚，选 GitHub 夜间。


## 朗读

齿轮 → 朗读。电子书阅读页可用系统语音读正文。

- 语种：自动、中文、英语、中英混合。自动和中英混合会把 Kubernetes、JSON、REST API 这类词交给英文语音，避免逐字母拼读
- 音色：列出本机已安装的中文和英文语音。没有英文音色时，请到系统设置安装英文语音包
- 语速：与阅读页底栏相同，四档可切换
- 自动播放：开则读完本章接着下一章，长段会滚到正在读的句子；关则读完本章停止

网页预览里通常没有朗读接口，请在安卓或电脑应用中使用。

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

## 博客

齿轮 → 博客。填写 GitHub Token（需要仓库 contents 写入）、仓库 `owner/repo`、分支、Hugo 或 Hexo、文章目录。

填好后，侧栏报纸图标（或设置里「查看仓库文章」）会列出文章目录里已有的 Markdown。点开可读；没有本地副本就拉进「博客」文件夹，已有的可以打开或用仓库覆盖。YAML 会原样留下，改完用工具栏纸飞机发回同一个文件。

工具栏纸飞机把当前笔记写成一篇 Markdown 提交到仓库：Hugo 默认 `content/posts`，Hexo 默认 `source/_posts`。文件名是日期加标题。同一篇再发会覆盖上次那个文件。分类用笔记所在文件夹名。网站仍由仓库里的 GitHub Actions 构建。

## 同步与同时编辑

侧栏齿轮打开设置里的「同步」。四种方式：

| 方式 | 适用 | 保存路径 |
| --- | --- | --- |
| 静笺服务器 | 自建 Docker | 宿主机目录 `JINGJIAN_NOTES_PATH` |
| WebDAV | 坚果云、Nextcloud、群晖、NAS | 远程目录，如 `/静笺` |
| 本机目录 | 电脑选文件夹，安卓写入文档目录 | 文件夹名，默认 `Jingjian` |
| 对象存储 | 阿里云 OSS、腾讯云 COS、华为 OBS、七牛 Kodo、火山 TOS、Amazon S3、MinIO | 桶内前缀，默认 `jingjian/` |

开着自动同步时，开始或结束编辑、切到后台会同步；看笔记或正在输入时不会。也可点保存或设置里的立即同步。正在编辑的这一篇不会被远端覆盖。

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

### 对象存储

齿轮 → 同步 → 对象存储，再选一家云厂商。填写 Bucket、地域、AccessKey、SecretKey。笔记以 Markdown 文件写入桶内前缀（默认 `jingjian/`）。网页需在桶 CORS 放行当前站点；安卓与电脑应用可直连。

## Android

安装包在 [Releases](https://github.com/Ghostpanter/jingjian/releases) 下载 `jingjian-v1.7.4.apk`。

包名 `com.ghostpanter.jingjian`。首次安装需允许「未知来源」。从旧版覆盖安装即可，本地笔记会保留。

在文件管理器、下载记录里点 Markdown、TXT、EPUB、Kindle 或 FB2，「用其他应用打开」会出现静笺。分享文字或图片到静笺也会收入笔记。

## Windows / macOS / Linux

同一发布页提供桌面压缩包：

- `jingjian-v1.7.4-win-x64.zip`：解压后双击「打开静笺.bat」（不要直接点 `Jingjian.exe`）
- `jingjian-v1.7.4-mac-x64.zip`：解压后双击「打开静笺.command」。若提示无法打开，按住 Control 再点它，选「打开」。Finder 里对 Markdown / TXT / EPUB / Kindle / FB2 可选「打开方式」
- `jingjian-v1.7.4-linux-x64.zip`：解压后运行 `./Jingjian`（便携包已处理沙箱，不必改 chrome-sandbox）

电脑版用独立应用协议加载界面，不依赖浏览器。可在资源管理器里对 `.md` / `.txt` / `.epub` / `.mobi` / `.azw3` / `.fb2` 选「打开方式」→ 静笺；也可把文件拖进编辑区。本机目录、对象存储、WebDAV 由应用直连，不必配 CORS。

Windows / macOS 压缩包里有「打开静笺」启动器，会清掉系统给下载文件打的隔离标记，一般不必再点 SmartScreen 或去「隐私与安全性」手动允许。系统级签名（完全不再提示）需要 Windows 代码签名证书和 Apple 开发者账号公证；打包时设置 `WIN_CSC_FILE` / `APPLE_CSC_FILE` 即可。

桌面端与平板共用同一套同步。两边都打开自动同步后，开始/结束编辑或切到后台会对齐同一篇云端笔记。

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
| `Ctrl + B` / `I` / `U` | 加粗 / 斜体 / 下划线 |
| `Ctrl + Shift + 5` | 删除线 |
| `Ctrl + 1` … `6` | 一至六级标题 |
| `Ctrl + 0` | 正文段落 |
| `Tab` / `Shift + Tab` | 缩进 / 取消缩进 |
| `Ctrl + Shift + Q` | 引用 |
| `Ctrl + Shift + ]` / `[` | 无序 / 有序列表 |
| `Ctrl + Shift + X` | 任务列表 |
| `Ctrl + Shift + K` | 代码块 |
| `Ctrl + T` | 插入表格 |
| `Ctrl + K` | 插入外链 |
| `Ctrl + Shift + I` | 插入图片 |
| `Ctrl + N` | 新建笔记 |
| `Ctrl + F` | 当前文档查找 |
| `Ctrl + H` | 当前文档替换 |
| `/` | 搜索笔记列表 |
| `Ctrl + /` 或 `Ctrl + E` | 源码 / 分栏 / 预览 |
| `Ctrl + S` | 保存到文档/jingjian |
| `Ctrl + Shift + S` | 另存为 |
| `Ctrl + Shift + L` | 显示或收起文件列表 |
| `Ctrl + ,` | 设置（同步 / 主题 / 图像 / 关于） |
| `Ctrl + Shift + E` | 导出 |
| `Ctrl + Shift + Backspace` | 删除当前笔记 |
| `J` / `K` 或方向键 | 上一条 / 下一条 |

## 许可

MIT。齿轮 → 关于 可查看版本、更新日期和协议全文。

## 捐赠

静笺免费、没有账号和广告。若想支持后续开发，可到 [GitHub Sponsors](https://github.com/sponsors/Ghostpanter)，或给仓库点星。
