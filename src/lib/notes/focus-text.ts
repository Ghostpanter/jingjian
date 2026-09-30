/** Paragraph containing the caret, split on a blank line. */
export function paragraphAt(text: string, cursor: number): { start: number; end: number } {
  const pos = Math.max(0, Math.min(cursor, text.length));
  let start = 0;
  const limit = Math.max(0, pos - 1);
  for (let i = 0; i < limit; i += 1) {
    if (text.charCodeAt(i) === 10 && text.charCodeAt(i + 1) === 10) start = i + 2;
  }
  let end = text.length;
  for (let i = pos; i < text.length - 1; i += 1) {
    if (text.charCodeAt(i) === 10 && text.charCodeAt(i + 1) === 10) {
      end = i;
      break;
    }
  }
  if (start > end) start = end;
  return { start, end };
}

/** Scroll offset that keeps the caret near the upper-middle of the editor. */
export function typewriterScroll(caretTop: number, caretHeight: number, viewHeight: number): number {
  return Math.max(0, caretTop - viewHeight * 0.42 + caretHeight / 2);
}
