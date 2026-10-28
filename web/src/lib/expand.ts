import type { DiffFile, DiffLine } from "../../../shared/types";
import type { ReviewComment } from "./review";

/** Lines revealed per click, as on GitHub. */
export const EXPAND_STEP = 20;

/** An inclusive range of new-side line numbers. */
export type Span = { start: number; end: number };

export type DiffRow =
  | {
      kind: "gap";
      key: string;
      /** The hunk header, when this row sits directly above a hunk. */
      header: string | null;
      /** The hidden lines; empty (start > end) for a header with nothing above it. */
      hidden: Span;
      /** Lines can be revealed upwards from the shown line below / downwards from the one above. */
      up: boolean;
      down: boolean;
    }
  | { kind: "line"; line: DiffLine; index: number; expanded: boolean };

/**
 * Merges the file's hunks with the revealed lines of the gaps around them. Gap lines are
 * unchanged, so they come from the new contents with old line numbers shifted by the net
 * deletions of the hunks above.
 */
export function buildRows(file: DiffFile, revealed: Span[]): DiffRow[] {
  const source = expandableLines(file);
  const isRevealed = (n: number) => revealed.some((span) => n >= span.start && n <= span.end);
  const rows: DiffRow[] = [];
  let index = 0;
  let offset = 0;

  const gapRow = (hidden: Span, header: string | null): DiffRow => ({
    kind: "gap",
    key: `gap:${hidden.start}-${hidden.end}`,
    header,
    hidden,
    up: source !== null && hidden.start <= hidden.end && hidden.end < source.length,
    down: source !== null && hidden.start <= hidden.end && hidden.start > 1,
  });

  const addGap = (start: number, end: number, header: string | null) => {
    if (!source || start > end) {
      if (header !== null) rows.push(gapRow({ start, end }, header));
      return;
    }
    let hiddenStart: number | null = null;
    for (let n = start; n <= end; n++) {
      if (!isRevealed(n)) {
        hiddenStart ??= n;
        continue;
      }
      if (hiddenStart !== null) rows.push(gapRow({ start: hiddenStart, end: n - 1 }, null));
      hiddenStart = null;
      const content = source[n - 1] ?? "";
      const line: DiffLine = { type: "context", oldNo: n + offset, newNo: n, content };
      rows.push({ kind: "line", line, index: index++, expanded: true });
    }
    if (hiddenStart !== null) rows.push(gapRow({ start: hiddenStart, end }, header));
  };

  let prevEnd = 0;
  for (const hunk of file.hunks) {
    const count = hunk.lines.filter((line) => line.type !== "del").length;
    // A hunk with no new-side lines starts *after* newStart.
    const first = count > 0 ? hunk.newStart : hunk.newStart + 1;
    addGap(prevEnd + 1, first - 1, hunk.header);
    for (const line of hunk.lines) {
      rows.push({ kind: "line", line, index: index++, expanded: false });
      if (line.type === "add") offset--;
      if (line.type === "del") offset++;
    }
    prevEnd = first + count - 1;
  }
  if (file.hunks.length > 0 && source) addGap(prevEnd + 1, source.length, null);
  return rows;
}

export function rowLines(rows: DiffRow[]): DiffLine[] {
  return rows.flatMap((row) => (row.kind === "line" ? [row.line] : []));
}

/** The new file's lines, or null if they're missing or don't match the diff. */
function expandableLines(file: DiffFile): string[] | null {
  if (file.binary || file.newContent === undefined) return null;
  const lines = file.newContent.split("\n");
  if (file.newContent.endsWith("\n")) lines.pop();
  for (const hunk of file.hunks) {
    for (const line of hunk.lines) {
      if (line.newNo !== null && lines[line.newNo - 1] !== line.content) return null;
    }
  }
  return lines;
}

/** The new-side lines each comment covers, so lines commented on stay revealed. */
export function commentSpans(comments: ReviewComment[]): Span[] {
  const spans: Span[] = [];
  for (const { range, snippet } of comments) {
    if (!range) continue;
    const { start, end } = range;
    const newLines = snippet.filter((line) => line.type !== "del").length;
    if (end.side === "new") {
      const first = start.side === "new" ? start.line : end.line - newLines + 1;
      spans.push({ start: Math.max(1, first), end: end.line });
    } else if (start.side === "new") {
      spans.push({ start: start.line, end: start.line + Math.max(0, newLines - 1) });
    }
  }
  return spans;
}
