import { localDateStamp, localDateTime } from "./blog-publish.ts";

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
  return NOTE_TEMPLATES.find((item) => item.id === id) ?? null;
}
