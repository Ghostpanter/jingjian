# 静笺

专注写作的本地 Markdown 笔记。没有账号，没有打开 / 保存菜单，输入即写入这台设备。

适合平板分栏：左边是文件列表，右边直接写。点一篇笔记就开始编辑。

## 功能

- 左侧文件列表，按最后编辑时间分组
- Markdown 源码、分栏、预览
- 即时搜索标题和正文
- 新建 / 删除（删除前确认）
- 字数与自动保存
- 键盘操作（`Ctrl+N` 新建，`Ctrl+F` 搜索，`Ctrl+E` 切换视图，`?` 查看全部）

## Android

安装包在 [Releases](https://github.com/Ghostpanter/jingjian/releases) 下载 `jingjian-v1.2.0.apk`。

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
| `Ctrl + Shift + Backspace` | 删除当前笔记 |
| `J` / `K` 或方向键 | 上一条 / 下一条 |
| `?` | 快捷键一览 |

## 许可

MIT
