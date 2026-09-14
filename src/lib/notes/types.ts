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
  /** Body lives in IndexedDB; localStorage only keeps a title head. */
  overflow?: boolean;
  /** Nested sidebar path, e.g. `手册/写作`. */
  folder?: string;
};
