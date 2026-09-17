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
  bookAuthor?: string;
  /** Local image src, e.g. `images/abc.jpg`. */
  bookCover?: string;
  chapterIndex?: number;
  /** 0–1 scroll position within the chapter; does not count as an edit. */
  readRatio?: number;
  /** Last time this chapter was opened in the reader. */
  readAt?: number;
  /** Body lives in IndexedDB; localStorage only keeps a title head. */
  overflow?: boolean;
  /** Nested sidebar path, e.g. `手册/写作`. */
  folder?: string;
};
