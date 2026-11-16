import type { DiffFile, DiffHunk, DiffLine } from "../../../shared/types";
import { lcs } from "./lcs";

/** Context lines kept around each change when hunks are rebuilt, as git does by default. */
const CONTEXT = 3;

export const stripWhitespace = (text: string) => text.replace(/\s+/g, "");

/**
 * The file as `git diff -w` would show it: within each run of changes, deleted and added lines
 * that differ only in whitespace become context (with the new content), and hunks are trimmed to
 * the remaining changes. Returns the same object when nothing changes.
 */
export function hideWhitespace(file: DiffFile): DiffFile {
  if (file.binary) return file;
  let changed = false;
  const hunks = file.hunks.flatMap((hunk) => {
    const lines = ignoreWhitespace(hunk.lines);
    if (lines === hunk.lines) return [hunk];
    changed = true;
    return rehunk(hunk, lines);
  });
  if (!changed) return file;
  const all = hunks.flatMap((hunk) => hunk.lines);
  return {
    ...file,
    hunks,
    additions: all.filter((line) => line.type === "add").length,
    deletions: all.filter((line) => line.type === "del").length,
  };
}

function ignoreWhitespace(lines: DiffLine[]): DiffLine[] {
  const result: DiffLine[] = [];
  let changed = false;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.type === "context") {
      result.push(lines[i++]!);
      continue;
    }
    const dels: DiffLine[] = [];
    const adds: DiffLine[] = [];
    for (; i < lines.length && lines[i]!.type !== "context"; i++) {
      (lines[i]!.type === "del" ? dels : adds).push(lines[i]!);
    }
    const matches =
      dels.length > 0 && adds.length > 0
        ? lcs(
            dels.map((l) => stripWhitespace(l.content)),
            adds.map((l) => stripWhitespace(l.content)),
          )
        : null;
    if (!matches || matches.length === 0) {
      result.push(...dels, ...adds);
      continue;
    }
    changed = true;
    let d = 0;
    let a = 0;
    for (const [di, ai] of [...matches, [dels.length, adds.length] as const]) {
      result.push(...dels.slice(d, di), ...adds.slice(a, ai));
      const del = dels[di];
      const add = adds[ai];
      if (del && add) {
        result.push({ type: "context", oldNo: del.oldNo, newNo: add.newNo, content: add.content });
      }
      d = di + 1;
      a = ai + 1;
    }
  }
  return changed ? result : lines;
}

/** Splits a hunk's lines into hunks around the changes left, dropping it if there are none. */
function rehunk(hunk: DiffHunk, lines: DiffLine[]): DiffHunk[] {
  const keep = Array.from({ length: lines.length }, () => false);
  lines.forEach((line, index) => {
    if (line.type === "context") return;
    keep.fill(true, Math.max(0, index - CONTEXT), index + CONTEXT + 1);
  });

  const heading = hunk.header.replace(/^@@[^@]*@@/, "");
  // The next old/new line numbers, at the current position in `lines`.
  let oldNext = hunk.lines.some((line) => line.type !== "add") ? hunk.oldStart : hunk.oldStart + 1;
  let newNext = hunk.lines.some((line) => line.type !== "del") ? hunk.newStart : hunk.newStart + 1;
  const hunks: DiffHunk[] = [];
  let index = 0;
  while (index < lines.length) {
    if (!keep[index]) {
      const line = lines[index++]!;
      if (line.type !== "add") oldNext++;
      if (line.type !== "del") newNext++;
      continue;
    }
    const group: DiffLine[] = [];
    while (index < lines.length && keep[index]) group.push(lines[index++]!);
    const oldCount = group.filter((line) => line.type !== "add").length;
    const newCount = group.filter((line) => line.type !== "del").length;
    // Like git, an empty side's start is the line before.
    const oldStart = oldCount > 0 ? oldNext : oldNext - 1;
    const newStart = newCount > 0 ? newNext : newNext - 1;
    hunks.push({
      header: `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@${hunks.length === 0 ? heading : ""}`,
      oldStart,
      newStart,
      lines: group,
    });
    oldNext += oldCount;
    newNext += newCount;
  }
  return hunks;
}
