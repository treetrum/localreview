import { filePath, type DiffFile } from "../../../shared/types";
import { buildRows, commentSpans, rowLines } from "./expand";
import { linePos, posKey, rangeLabel, type ReviewComment, type SnippetLine } from "./review";

export type FormatInput = {
  label: string;
  /** In display (tree) order. */
  files: DiffFile[];
  summary: string;
  comments: ReviewComment[];
};

const INTRO =
  "Please address the following review feedback. Line numbers refer to the new version of each file unless marked as deleted.";

export function formatReview({ label, files, summary, comments }: FormatInput): string {
  const sections = [`# Code review: ${label}`, INTRO];
  if (summary.trim()) sections.push("## Overall", summary.trim());

  const byPath = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    if (!comment.body.trim()) continue;
    byPath.set(comment.path, [...(byPath.get(comment.path) ?? []), comment]);
  }

  const known = new Map(files.map((file) => [filePath(file), file]));
  const paths = [
    ...files.map(filePath).filter((path) => byPath.has(path)),
    ...[...byPath.keys()].filter((path) => !known.has(path)).toSorted(),
  ];

  for (const path of paths) {
    sections.push(`## ${inlineCode(path)}`);
    const file = known.get(path);
    const fileComments = byPath.get(path) ?? [];
    // Lines commented on outside the hunks count as present, as they stay revealed in the UI.
    const lines = file ? rowLines(buildRows(file, commentSpans(fileComments))) : [];
    const positions = new Map(lines.map((line, i) => [posKey(linePos(line)), i]));
    // File-level comments first, then outdated ones (as shown in the UI), then by end line.
    const order = (comment: ReviewComment) =>
      comment.range ? (positions.get(posKey(comment.range.end)) ?? -1) : -2;
    const sorted = fileComments.toSorted(
      (a, b) => order(a) - order(b) || a.createdAt - b.createdAt,
    );

    for (const comment of sorted) {
      if (comment.range) {
        const outdated = !positions.has(posKey(comment.range.end));
        sections.push(`### ${rangeLabel(comment.range)}${outdated ? " (outdated)" : ""}`);
        if (comment.snippet.length > 0) sections.push(diffFence(comment.snippet));
      }
      sections.push(comment.body.trim());
    }
  }
  return `${sections.join("\n\n")}\n`;
}

const PREFIX = { add: "+", del: "-", context: " " } as const;

function diffFence(snippet: SnippetLine[]): string {
  const body = snippet.map((line) => PREFIX[line.type] + line.content).join("\n");
  const fence = "`".repeat(Math.max(3, longestBacktickRun(body) + 1));
  return `${fence}diff\n${body}\n${fence}`;
}

function inlineCode(text: string): string {
  const ticks = "`".repeat(longestBacktickRun(text) + 1);
  const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${ticks}${pad}${text}${pad}${ticks}`;
}

function longestBacktickRun(text: string): number {
  let longest = 0;
  for (const match of text.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return longest;
}
