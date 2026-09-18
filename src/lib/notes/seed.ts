import type { Note } from "./types";

function note(id: string, content: string, updatedAgoMs: number, folder?: string): Note {
  const updatedAt = Date.now() - updatedAgoMs;
  return {
    id,
    content: content.trim() + "\n",
    createdAt: updatedAt,
    updatedAt,
    ...(folder ? { folder } : {}),
  };
}

export function createSeedNotes(): Note[] {
  return [
    note(
      "seed-welcome",
      `# 欢迎使用静笺

静笺是一款专注写作的本地 Markdown 笔记。没有账号。笔记先写在应用里；切到后台时，若正文有改动，会自动保存到系统「文档/jingjian」。也可点工具栏保存、另存为。

需要的话，可在侧栏齿轮里打开同步：自建服务器、WebDAV、本机文件夹，或对象存储（阿里云 / 腾讯云 / 华为云 / 七牛 / 火山 / Amazon S3 / MinIO）。

在平板上，侧栏与编辑区并排；打开分栏后，左边写 Markdown，右边立刻看到排版。分栏时两边会一起滚动。

## 常用操作

- 新建笔记：点左上角加号，可选 Markdown 或纯文本，或按 Ctrl + N
- 文件夹：加号里「新建文件夹」，会在文档/jingjian 里建同名目录。长按笔记可拖进或拖出文件夹；松手不移动则删除
- 文内查找 / 替换：Ctrl + F 查找，Ctrl + H 替换，支持正则
- 源码 / 分栏 / 预览：工具栏切换，或按 Ctrl + /、Ctrl + E
- 插入图片：工具栏图片按钮，或把图片粘贴、拖进编辑区，或 Ctrl + Shift + I
- 导出：右上角导出，只出 PDF、HTML、图片、Word、OpenOffice、RTF、EPUB
- 导入：左上角加号里导入 Markdown、TXT、文件夹或 EPUB。电子书出现在侧栏「书」，点阅读从上次停下的章节接着看；划线可摘到「摘录」；阅读页可朗读，英文专业词按单词读。齿轮 → 朗读 可选语种和音色。点章节仍是 Markdown。侧栏《廊下三章》是示例
- 主题、图床与朗读：侧栏齿轮 → 主题 / 图像 / 朗读。宣纸是默认，代码高亮已单独加深。图床可直接填，也可粘贴 PicGo 配置。朗读可选中文、英语或中英混合，并指定音色
- 发布到博客：齿轮 → 博客填 GitHub 或 Gitee 仓库。侧栏报纸图标可查看仓库里已有的文章，点开阅读或拉进本地再改，工具栏纸飞机发回去。新建可用模板
- 公式、任务、双链：\`$E=mc^2$\`，预览里勾选 \`- [ ]\`，\`[[笔记名]]\` 跳转，Ctrl + P 快速打开
- 安卓 / 电脑：在文件管理器里用「打开方式」选静笺，可直接打开 Markdown、TXT、EPUB；也可把文件拖进编辑区
- 插入外链：选中文字后按 Ctrl + K，或直接把网址粘到选中文字上
- 加粗 / 斜体 / 标题：Ctrl + B、Ctrl + I、Ctrl + 1～6，Tab 缩进列表
- 显示或收起侧栏：Ctrl + Shift + L
- 删除当前笔记：Ctrl + Shift + Backspace

第一行会自动成为标题。开始写吧。`,
      2 * 60 * 1000,
    ),
    note(
      "seed-markdown",
      `# Markdown 速查

用轻量标记来组织文章，不必离开键盘。

## 强调与结构

普通段落直接写。前后空一行。

**加粗**、*斜体*、<u>下划线</u>、~~删除线~~、\`行内代码\`。

选中文字后按 Ctrl + B / I / U，或 Ctrl + 1～6 设标题。Tab 缩进列表。

> 引用适合摘录。左侧那条线就是它的位置。

> [!note] 提示框
> 引用第一行写成 \`[!note]\` 或 \`[!warning]\`，预览里会变成色块。

脚注写成 \`见这里[^1]\`，文末单独一行 \`[^1]: 说明\`。例如见这里[^demo]。

行内公式：$E=mc^2$

$$
E = mc^2
$$

双链写成 \`[[笔记名]]\`，例如 [[欢迎使用静笺]]。

[^demo]: 这是脚注正文。

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
      "手册",
    ),
    note(
      "seed-essay",
      `# 窗边

下午的光线从左侧进来，把桌面切成两条。一条亮，一条刚好够看清纸上的字。

不必赶。句子写完，停一下，听听风过走廊的声音。有些意思要等它自己抵达，不能靠催促。

若是出门，就把这篇留在这里。回来时它还在，墨迹未干。`,
      2 * 24 * 60 * 60 * 1000,
    ),
    ...createSeedBook(),
  ];
}

function createSeedBook(): Note[] {
  const bookId = "seed-book-corridor";
  const bookTitle = "廊下三章";
  const chapters = [
    {
      id: "seed-book-1",
      index: 0,
      ago: 5 * 24 * 60 * 60 * 1000,
      content: `# 一 廊下

傍晚的风从天井灌进来，把廊下的纸灯吹得轻轻晃。人坐在第二根柱子旁，膝上摊开一本旧书，字迹被灯色染成浅琥珀。

不必读完。有些句子只适合在这个时辰停留片刻，然后合上。`,
    },
    {
      id: "seed-book-2",
      index: 1,
      ago: 5 * 24 * 60 * 60 * 1000 - 60_000,
      content: `# 二 灯下

灯芯剪过一次，屋子里就安静许多。墨磨到第三圈，纸上才落下第一笔。

写字的人并不急着成篇。他只是把白天走过的路，在格子里再走一遍。`,
    },
    {
      id: "seed-book-3",
      index: 2,
      ago: 5 * 24 * 60 * 60 * 1000 - 120_000,
      content: `# 三 合卷

夜深了。他把三章按顺序叠好，用一条浅青书签夹住。明天若还记得，就从这里接着读；若忘了，便当它从未被打开过。

电子书可以这样读：侧栏「书」里点阅读，会回到上次的章节和位置；划线后点「摘录」写进笔记；朗读只出现在阅读页，可把 Kubernetes、JSON 这类词按单词读出。齿轮 → 朗读 里可选语种和音色。点章节仍打开 Markdown。改完再导出本书，会带上作者和封面。`,
    },
  ];
  return chapters.map((chapter) => {
    const updatedAt = Date.now() - chapter.ago;
    return {
      id: chapter.id,
      content: chapter.content.trim() + "\n",
      createdAt: updatedAt,
      updatedAt,
      bookId,
      bookTitle,
      bookAuthor: "静笺",
      chapterIndex: chapter.index,
    };
  });
}
