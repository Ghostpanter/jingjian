# 静笺

专注写作的本地 Markdown 笔记。没有账号，没有云端同步，内容只保存在这台设备上。

适合平板分栏阅读：左边写，右边立刻看到排版。

## 功能

- 侧栏笔记列表，按最后编辑时间分组
- Markdown 编辑，支持标题、列表、引用、代码、表格、任务清单
- 即时搜索标题和正文
- 新建 / 删除（删除前确认）
- 最后编辑时间与字数
- 编辑 / 分栏 / 预览三种视图
- 键盘操作（`Ctrl+N` 新建，`Ctrl+F` 搜索，`Ctrl+E` 切换视图，`?` 查看全部）
- 数据写入浏览器本地存储

## Android

安装包在 [Releases](https://github.com/Ghostpanter/jingjian/releases) 下载 `jingjian-v1.1.0.apk`。

包名 `com.ghostpanter.jingjian`。首次安装需允许「未知来源」。笔记仍只保存在这台设备上。

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
| `Ctrl + E` | 切换编辑 / 分栏 / 预览 |
| `Ctrl + B` | 显示或收起侧栏 |
| `Ctrl + Shift + Backspace` | 删除当前笔记 |
| `J` / `K` 或方向键 | 上一条 / 下一条 |
| `?` | 快捷键一览 |

## 许可

MIT
