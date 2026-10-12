/**
 * Decide whether a parent `content` prop should be written into CodeMirror.
 *
 * Always compare against the *latest* parent value (pass contentRef.current),
 * not the value closed over by a stale effect — a delayed effect from an older
 * render would otherwise clobber keystrokes that landed in the meantime.
 */
export function shouldApplyExternalContent(options: {
  /** Latest parent value (from a ref), not a stale effect closure. */
  content: string;
  lastEmitted: string;
  doc: string;
  composing: boolean;
}): boolean {
  if (options.composing) return false;
  if (options.content === options.doc) return false;
  if (options.content === options.lastEmitted) return false;
  return true;
}
