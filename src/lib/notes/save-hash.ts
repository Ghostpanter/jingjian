export type SaveRecord = {
  path: string;
  hash: string;
  relative: boolean;
};

export function contentHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function shouldAutosave(content: string, previous: SaveRecord | null): boolean {
  if (!previous) return true;
  return previous.hash !== contentHash(content);
}
