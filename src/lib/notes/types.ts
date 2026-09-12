export type PreviewMode = "edit" | "split" | "preview";

export type NoteFormat = "md" | "txt";

export type Note = {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  format?: NoteFormat;
  bookId?: string;
  bookTitle?: string;
  chapterIndex?: number;
};
