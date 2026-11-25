import type { ReviewComment } from "./review";

const endLine = (comment: ReviewComment) => comment.range?.end.line ?? -1;

export type CommentGroup = { path: string; comments: ReviewComment[] };

/**
 * Groups comments by file, with files in `paths` (tree) order and any others appended sorted.
 * Within a file: file-level comments first, then by end line, then by creation time.
 */
export function groupComments(comments: ReviewComment[], paths: string[]): CommentGroup[] {
  const byPath = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    byPath.set(comment.path, [...(byPath.get(comment.path) ?? []), comment]);
  }
  const known = new Set(paths);
  const ordered = [
    ...paths.filter((path) => byPath.has(path)),
    ...[...byPath.keys()].filter((path) => !known.has(path)).toSorted(),
  ];
  return ordered.map((path) => ({
    path,
    comments: (byPath.get(path) ?? []).toSorted(
      (a, b) => endLine(a) - endLine(b) || a.createdAt - b.createdAt,
    ),
  }));
}

/** Strips the leading whitespace shared by all non-blank lines, so a snippet starts at its code. */
export function dedent<T extends { content: string }>(lines: T[]): T[] {
  const indents = lines
    .filter((line) => line.content.trim())
    .map((line) => /^[ \t]*/.exec(line.content)![0]);
  if (indents.length === 0) return lines;
  let common = indents[0]!;
  for (const indent of indents) {
    while (!indent.startsWith(common)) common = common.slice(0, -1);
  }
  if (!common) return lines;
  return lines.map((line) => ({ ...line, content: line.content.slice(common.length) }));
}
