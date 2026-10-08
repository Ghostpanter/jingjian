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
  /** Starred in the library. Synced; does not bump `updatedAt`. */
  starred?: boolean;
  /** When the star was last set or cleared. */
  starredAt?: number;
  /** Last time the note was opened. Synced; does not bump `updatedAt`. */
  openedAt?: number;
  /** Soft-deleted. Newer than `restoredAt` means it sits in the trash. */
  trashedAt?: number;
  /** Restored from trash. Newer than `trashedAt` means it is visible again. */
  restoredAt?: number;
  /** Body lives in IndexedDB; localStorage only keeps a title head. */
  overflow?: boolean;
  /** Nested sidebar path, e.g. `手册/写作`. */
  folder?: string;
};
