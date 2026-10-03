import { localDateStamp, localDateTime } from "./blog-publish.ts";
import { platformEnabled, readPlatformPrefs, type PlatformId } from "./blog-platforms.ts";
import { isBlogConfigured, readBlogConfig } from "./blog-config.ts";

export type NoteTemplate = {
  id: string;
  name: string;
  hint: string;
  content: (now?: Date) => string;
};

export const NOTE_TEMPLATES: NoteTemplate[] = [
  {
    id: "blank",
    name: "空白",
    hint: "从第一行开始写",
    content: () => "",
  },
  {
    id: "daily",
    name: "日记",
    hint: "当天日期作标题",
    content: (now = new Date()) => `# ${localDateStamp(now)}\n\n`,
  },
  {
    id: "meeting",
    name: "会议",
    hint: "时间、参与、决议",
    content: (now = new Date()) =>
      `# 会议 ${localDateStamp(now)}\n\n- 时间：${localDateTime(now).hexo}\n- 参与：\n- 议题：\n- 决议：\n\n`,
  },
  {
    id: "blog",
    name: "博客文章",
    hint: "带 YAML，可直接发布",
    content: (now = new Date()) =>
      `---\ntitle: ""\ndate: ${localDateTime(now).iso}\ndraft: false\n---\n\n# \n\n`,
  },
];

export function templateById(id: string): NoteTemplate | null {
  return NOTE_TEMPLATES.find((item) => item.id === id) ?? platformTemplate(id);
}

const PLATFORM_TEMPLATES: { platform: PlatformId; template: NoteTemplate }[] = [
  {
    platform: "wordpress",
    template: {
      id: "wordpress",
      name: "WordPress",
      hint: "标题和正文",
      content: () => "# \n\n",
    },
  },
  {
    platform: "typecho",
    template: {
      id: "typecho",
      name: "Typecho",
      hint: "Markdown 正文",
      content: () => "# \n\n",
    },
  },
  {
    platform: "halo",
    template: {
      id: "halo",
      name: "Halo",
      hint: "标题、别名",
      content: () => "---\ntitle: \"\"\nslug: \"\"\n---\n\n# \n\n",
    },
  },
  {
    platform: "ghost",
    template: {
      id: "ghost",
      name: "Ghost",
      hint: "标题和标签",
      content: (now = new Date()) =>
        `---\ntitle: ""\ndate: ${localDateTime(now).iso}\ntags: []\nstatus: draft\n---\n\n# \n\n`,
    },
  },
  {
    platform: "yuque",
    template: {
      id: "yuque",
      name: "语雀",
      hint: "知识库正文",
      content: () => "# \n\n",
    },
  },
];

function platformTemplate(id: string): NoteTemplate | null {
  return PLATFORM_TEMPLATES.find((item) => item.template.id === id)?.template ?? null;
}

export function menuTemplates(): NoteTemplate[] {
  const prefs = readPlatformPrefs();
  const gitOn = platformEnabled(prefs, "git", isBlogConfigured(readBlogConfig()));
  const extras = PLATFORM_TEMPLATES.filter((item) => platformEnabled(prefs, item.platform, gitOn)).map(
    (item) => item.template,
  );
  return [...NOTE_TEMPLATES, ...extras];
}
