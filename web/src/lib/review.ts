import type { DiffFile, DiffLine, DiffLineType, DiffResponse } from "../../../shared/types";

export type Side = "old" | "new";
export type LinePos = { side: Side; line: number };
export type LineRange = { start: LinePos; end: LinePos };
export type SnippetLine = { type: DiffLineType; content: string };

export type ReviewComment = {
  id: string;
  path: string;
  /** null = file-level comment */
  range: LineRange | null;
  snippet: SnippetLine[];
  body: string;
  createdAt: number;
};

export type NewComment = Omit<ReviewComment, "id" | "createdAt">;

export type ReviewState = {
  summary: string;
  comments: ReviewComment[];
  /** path -> fingerprint of the diff when it was marked viewed */
  viewed: Record<string, string>;
};

export const emptyReview = (): ReviewState => ({ summary: "", comments: [], viewed: {} });

export function storageKey(diff: Pick<DiffResponse, "repoRoot" | "label">): string {
  return `localreview:${diff.repoRoot}:${diff.label}`;
}

/** Deleted lines are anchored to the old side; everything else to the new side. */
export function linePos(line: DiffLine): LinePos {
  return line.type === "del"
    ? { side: "old", line: line.oldNo ?? 0 }
    : { side: "new", line: line.newNo ?? 0 };
}

export function posKey(pos: LinePos): string {
  return `${pos.side}:${pos.line}`;
}

export function flattenLines(file: DiffFile): DiffLine[] {
  return file.hunks.flatMap((hunk) => hunk.lines);
}

export function rangeLabel(range: LineRange): string {
  const { start, end } = range;
  if (start.side !== end.side) return `Lines ${start.side} ${start.line}–${end.side} ${end.line}`;
  const deleted = start.side === "old" ? " (deleted)" : "";
  if (start.line === end.line) return `Line ${start.line}${deleted}`;
  return `Lines ${start.line}–${end.line}${deleted}`;
}

export function hasFeedback(review: Pick<ReviewState, "summary" | "comments">): boolean {
  return review.summary.trim() !== "" || review.comments.some((c) => c.body.trim() !== "");
}

/** A fast FNV-1a hash over everything that makes up a file's diff. */
export function fileFingerprint(file: DiffFile): string {
  let hash = 0x811c9dc5;
  const add = (text: string) => {
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    hash ^= 0xff;
    hash = Math.imul(hash, 0x01000193);
  };
  add(file.status);
  add(file.oldPath);
  add(file.newPath);
  add(file.binary ? "1" : "0");
  let lines = 0;
  for (const hunk of file.hunks) {
    add(hunk.header);
    for (const line of hunk.lines) {
      add(line.type);
      add(line.content);
      lines++;
    }
  }
  return `${(hash >>> 0).toString(36)}-${lines}`;
}
