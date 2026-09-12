# 静笺

专注写作的本地 Markdown 笔记。没有账号，没有打开 / 保存菜单，输入即写入这台设备。

适合平板分栏：左边是文件列表，右边直接写。点一篇笔记就开始编辑。

## 功能

- 左侧文件列表，按最后编辑时间分组
- Markdown 源码、分栏、预览
- 代码高亮（常见语言）与 Mermaid 流程图
- 插入外链：Ctrl + K，或把网址粘到选中文字上
- 即时搜索标题和正文
- 新建 / 删除（删除前确认）
- 字数与自动保存
- 同步：静笺服务器、WebDAV、本机目录
- 键盘操作（`Ctrl+N` 新建，`Ctrl+,` 同步设置，`?` 查看全部）

## 同步

侧栏齿轮打开「同步与保存路径」。三种方式：

| 方式 | 适用 | 保存路径 |
| --- | --- | --- |
| 静笺服务器 | 自建 Docker | 宿主机目录 `JINGJIAN_NOTES_PATH` |
| WebDAV | 坚果云、Nextcloud、群晖、NAS | 远程目录，如 `/静笺` |
| 本机目录 | 电脑选文件夹，安卓写入文档目录 | 文件夹名，默认 `Jingjian` |

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

安装包在 [Releases](https://github.com/Ghostpanter/jingjian/releases) 下载 `jingjian-v1.4.0.apk`。

包名 `com.ghostpanter.jingjian`。首次安装需允许「未知来源」。从旧版覆盖安装即可，本地笔记会保留。

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
```

## 快捷键

| 按键 | 作用 |
| --- | --- |
| `Ctrl + N` | 新建笔记 |
| `Ctrl + F` 或 `/` | 搜索 |
| `Ctrl + E` | 源码 / 分栏 / 预览 |
| `Ctrl + B` | 显示或收起文件列表 |
| `Ctrl + ,` | 同步与保存路径 |
| `Ctrl + K` | 插入外链 |
| `Ctrl + Shift + Backspace` | 删除当前笔记 |
| `J` / `K` 或方向键 | 上一条 / 下一条 |
| `?` | 快捷键一览 |

## 许可

MIT
