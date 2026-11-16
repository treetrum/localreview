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
