export type TextHunk = {
  kind: "same" | "local" | "remote" | "replace";
  local: string;
  remote: string;
};

export function textHunks(local: string, remote: string): TextHunk[] {
  if (local === remote) return [{ kind: "same", local, remote }];
  const left = local.split(/\n{2,}/);
  const right = remote.split(/\n{2,}/);
  if (left.length * right.length > 160_000) {
    return [{ kind: "replace", local, remote }];
  }
  const rows = left.length;
  const cols = right.length;
  const dp = new Uint32Array((rows + 1) * (cols + 1));
  const at = (row: number, col: number) => row * (cols + 1) + col;
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      dp[at(row, col)] =
        left[row] === right[col]
          ? dp[at(row + 1, col + 1)] + 1
          : Math.max(dp[at(row + 1, col)], dp[at(row, col + 1)]);
    }
  }
  const hunks: TextHunk[] = [];
  const push = (hunk: TextHunk) => {
    const last = hunks[hunks.length - 1];
    if (last && last.kind === hunk.kind && hunk.kind !== "replace") {
      last.local = last.local && hunk.local ? `${last.local}\n\n${hunk.local}` : last.local || hunk.local;
      last.remote = last.remote && hunk.remote ? `${last.remote}\n\n${hunk.remote}` : last.remote || hunk.remote;
      return;
    }
    hunks.push({ ...hunk });
  };
  let row = 0;
  let col = 0;
  while (row < rows && col < cols) {
    if (left[row] === right[col]) {
      push({ kind: "same", local: left[row] ?? "", remote: right[col] ?? "" });
      row += 1;
      col += 1;
    } else if (dp[at(row + 1, col)] >= dp[at(row, col + 1)]) {
      push({ kind: "local", local: left[row] ?? "", remote: "" });
      row += 1;
    } else {
      push({ kind: "remote", local: "", remote: right[col] ?? "" });
      col += 1;
    }
  }
  while (row < rows) {
    push({ kind: "local", local: left[row] ?? "", remote: "" });
    row += 1;
  }
  while (col < cols) {
    push({ kind: "remote", local: "", remote: right[col] ?? "" });
    col += 1;
  }
  return hunks;
}

/** `choices[i] === true` keeps the local side of the i-th differing hunk. */
export function applyHunks(hunks: TextHunk[], choices: boolean[]): string {
  const parts: string[] = [];
  let choice = 0;
  for (const hunk of hunks) {
    if (hunk.kind === "same") {
      if (hunk.local) parts.push(hunk.local);
      continue;
    }
    const takeLocal = choices[choice] !== false;
    choice += 1;
    const text = takeLocal ? hunk.local : hunk.remote;
    if (text) parts.push(text);
  }
  return parts.join("\n\n");
}
