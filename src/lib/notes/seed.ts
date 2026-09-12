import type { Note } from "./types";

function note(id: string, content: string, updatedAgoMs: number): Note {
  const updatedAt = Date.now() - updatedAgoMs;
  return {
    id,
    content: content.trim() + "\n",
    createdAt: updatedAt,
    updatedAt,
  };
}

export function createSeedNotes(): Note[] {
  return [
    note(
      "seed-welcome",
      `# 欢迎使用静笺

静笺是一款专注写作的本地 Markdown 笔记。没有账号。输入即保存，没有打开 / 保存菜单。

需要的话，可在侧栏齿轮里打开同步：自建服务器、WebDAV 或本机文件夹。

在平板上，侧栏与编辑区并排；打开分栏后，左边写 Markdown，右边立刻看到排版。

## 常用操作

- 新建笔记：点左上角加号，或按 Ctrl + N
- 即时搜索：点侧栏搜索框，或按 Ctrl + F、/
- 预览排版：工具栏切换「源码 / 分栏 / 预览」，或按 Ctrl + E
- 插入外链：选中文字后按 Ctrl + K，或直接把网址粘到选中文字上
- 显示或收起侧栏：Ctrl + B
- 删除当前笔记：Ctrl + Shift + Backspace
- 快捷键一览：按 ?

第一行会自动成为标题。开始写吧。`,
      2 * 60 * 1000,
    ),
    note(
      "seed-markdown",
      `# Markdown 速查

用轻量标记来组织文章，不必离开键盘。

## 强调与结构

普通段落直接写。前后空一行。

**加粗**、*斜体*、~~删除线~~、\`行内代码\`。

> 引用适合摘录。左侧那条线就是它的位置。

## 列表

- 无序列表
- 再写一条
  - 可以缩进

1. 有序也一样
2. 编号会自动排

任务：

- [x] 写下第一篇
- [ ] 打开分栏看排版

## 代码高亮

围栏代码写上语言名，预览里会着色。

\`\`\`ts
function greet(name: string) {
  return \`你好，\${name}\`;
}
\`\`\`

\`\`\`python
def hello():
    return "静笺"
\`\`\`

## 流程图

用 \`\`\`mermaid 围栏，预览里会画出来。

\`\`\`mermaid
flowchart LR
  a[写下] --> b[自动保存]
  b --> c[预览]
  c --> d[同步]
\`\`\`

## 表格与外链

| 语法 | 效果 |
| --- | --- |
| # 标题 | 一级标题 |
| - 项目 | 列表 |
| > 句子 | 引用 |

一条分隔线：

---

链接写成 [静笺仓库](https://github.com/Ghostpanter/jingjian)。选中文字后按 Ctrl + K 也可以插入。

图片用外链：

![logo](https://raw.githubusercontent.com/Ghostpanter/jingjian/main/public/logo.png)`,
      3 * 60 * 60 * 1000,
    ),
    note(
      "seed-essay",
      `# 窗边

下午的光线从左侧进来，把桌面切成两条。一条亮，一条刚好够看清纸上的字。

不必赶。句子写完，停一下，听听风过走廊的声音。有些意思要等它自己抵达，不能靠催促。

若是出门，就把这篇留在这里。回来时它还在，墨迹未干。`,
      2 * 24 * 60 * 60 * 1000,
    ),
  ];
}
