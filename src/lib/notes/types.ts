export type PreviewMode = "edit" | "split" | "preview";

export type Note = {
  id: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  bookId?: string;
  bookTitle?: string;
  chapterIndex?: number;
};
