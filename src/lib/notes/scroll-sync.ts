export function clamp01(value: number): number {
  if (Number.isNaN(value) || value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function scrollMax(scrollHeight: number, clientHeight: number): number {
  return Math.max(0, scrollHeight - clientHeight);
}

/** Element Y inside a scroll root, from getBoundingClientRect values. */
export function contentOffset(elTop: number, rootTop: number, scrollTop: number): number {
  return elTop - rootTop + scrollTop;
}

export function mapScroll(
  fromTop: number,
  fromMax: number,
  toMax: number,
  fromAnchors: number[],
  toAnchors: number[],
): number {
  if (toMax <= 0) return 0;
  const t = fromMax <= 0 ? 0 : clamp01(fromTop / fromMax);
  if (
    fromAnchors.length < 2 ||
    fromAnchors.length !== toAnchors.length
  ) {
    return t * toMax;
  }

  let index = 0;
  while (index < fromAnchors.length - 2 && fromAnchors[index + 1] < t) {
    index += 1;
  }
  const a = fromAnchors[index];
  const b = fromAnchors[index + 1];
  const span = b - a;
  const local = span <= 1e-6 ? 0 : clamp01((t - a) / span);
  const start = toAnchors[index];
  const end = toAnchors[index + 1];
  return (start + (end - start) * local) * toMax;
}

export function ratioAnchors(
  sourceOffsets: number[],
  contentLength: number,
  previewTops: number[],
  previewHeight: number,
): { from: number[]; to: number[] } {
  const length = Math.max(1, contentLength);
  const height = Math.max(1, previewHeight);
  const from = [0];
  const to = [0];
  const count = Math.min(sourceOffsets.length, previewTops.length);
  for (let index = 0; index < count; index += 1) {
    from.push(clamp01(sourceOffsets[index] / length));
    to.push(clamp01(previewTops[index] / height));
  }
  from.push(1);
  to.push(1);
  return { from, to };
}
