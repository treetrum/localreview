import type { DiffFile, DiffLine } from "../../../shared/types";
import type { Token } from "./highlight";
import { lcs } from "./lcs";
import { linePos, posKey } from "./review";

/** Character offsets `[start, end)` of the changed parts of a line. */
export type Range = [number, number];
export type MarkedToken = Token & { changed?: boolean };

/** Lines longer than this aren't compared; minified code would just be noise. */
const MAX_LENGTH = 1000;
/** Below this share of unchanged (non-whitespace) characters, the lines are too different. */
const MIN_SIMILARITY = 0.5;
/** Above this many deletion × addition pairs, runs fall back to pairing lines by position. */
const MAX_MATCH_CELLS = 2500;

const WORD = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;
const isBlank = (text: string) => /^\s*$/.test(text);

/**
 * The changed parts of modified lines, keyed by `posKey`. Within each run of changes each deletion
 * is compared, word by word, with the addition `matchLines` pairs it with.
 */
export function intralineChanges(file: DiffFile): Map<string, Range[]> {
  const result = new Map<string, Range[]>();
  for (const hunk of file.hunks) {
    let dels: DiffLine[] = [];
    let adds: DiffLine[] = [];
    const flush = () => {
      const matches = matchLines(
        dels.map((line) => line.content),
        adds.map((line) => line.content),
      );
      for (const [i, j] of matches) {
        const del = dels[i]!;
        const add = adds[j]!;
        const ranges = compareLines(del.content, add.content);
        if (!ranges) continue;
        if (ranges.old.length > 0) result.set(posKey(linePos(del)), ranges.old);
        if (ranges.new.length > 0) result.set(posKey(linePos(add)), ranges.new);
      }
      dels = [];
      adds = [];
    };
    for (const line of hunk.lines) {
      if (line.type === "del") dels.push(line);
      else if (line.type === "add") adds.push(line);
      else flush();
    }
    flush();
  }
  return result;
}

/**
 * Index pairs `[i, j]` of deleted and added lines that are edits of each other, in order. Picks
 * the pairing with the most text in common, so lines inserted or removed in between (common once
 * whitespace is hidden) don't knock every later pair out of step, as pairing by position would.
 */
export function matchLines(oldLines: readonly string[], newLines: readonly string[]) {
  const n = oldLines.length;
  const m = newLines.length;
  const matches: [number, number][] = [];
  if (n * m > MAX_MATCH_CELLS) {
    for (let i = 0; i < Math.min(n, m); i++) matches.push([i, i]);
    return matches;
  }

  // best[i][j] = highest total similarity matching oldLines[i..] with newLines[j..].
  const width = m + 1;
  const best = new Float64Array((n + 1) * width);
  const score = new Float64Array(n * m);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      const s = similarity(oldLines[i]!, newLines[j]!);
      score[i * m + j] = s;
      best[i * width + j] = Math.max(
        best[(i + 1) * width + j]!,
        best[i * width + j + 1]!,
        s > 0 ? s + best[(i + 1) * width + j + 1]! : 0,
      );
    }
  }

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    const s = score[i * m + j]!;
    if (s > 0 && best[i * width + j] === s + best[(i + 1) * width + j + 1]!) {
      matches.push([i, j]);
      i++;
      j++;
    } else if (best[(i + 1) * width + j]! >= best[i * width + j + 1]!) i++;
    else j++;
  }
  return matches;
}

/** Share of the longer line's non-whitespace text the two have in common, or 0 below the minimum. */
function similarity(oldText: string, newText: string): number {
  return compareWords(oldText, newText)?.similarity ?? 0;
}

function compareWords(oldText: string, newText: string) {
  if (oldText.length > MAX_LENGTH || newText.length > MAX_LENGTH) return null;
  const a = oldText.match(WORD) ?? [];
  const b = newText.match(WORD) ?? [];
  const pairs = lcs(a, b);
  if (!pairs) return null;

  const common = pairs.reduce((sum, [i]) => sum + (isBlank(a[i]!) ? 0 : a[i]!.length), 0);
  const longest = Math.max(oldText.replace(/\s/g, "").length, newText.replace(/\s/g, "").length);
  if (longest === 0 || common / longest < MIN_SIMILARITY) return null;
  return { a, b, pairs, similarity: common / longest };
}

export function compareLines(
  oldText: string,
  newText: string,
): { old: Range[]; new: Range[] } | null {
  const compared = compareWords(oldText, newText);
  if (!compared) return null;
  const { a, b, pairs } = compared;
  const oldKept = new Set(pairs.map(([i]) => i));
  const newKept = new Set(pairs.map(([, j]) => j));
  return {
    old: changedRanges(a, oldKept),
    new: changedRanges(b, newKept),
  };
}

/** Ranges of the tokens not kept, joined across whitespace so "a b" is one range, not two. */
function changedRanges(tokens: string[], kept: Set<number>): Range[] {
  const ranges: Range[] = [];
  let offset = 0;
  let between = "";
  tokens.forEach((token, index) => {
    const start = offset;
    offset += token.length;
    // Whitespace is never marked: re-indented lines would otherwise light up at the margin.
    if (kept.has(index) || isBlank(token)) {
      between += token;
      return;
    }
    const last = ranges.at(-1);
    if (last && isBlank(between)) last[1] = offset;
    else ranges.push([start, offset]);
    between = "";
  });
  return ranges;
}

/** Splits tokens at range boundaries, flagging the parts inside a range. */
export function markTokens(tokens: Token[], ranges: Range[]): MarkedToken[] {
  if (ranges.length === 0) return tokens;
  const result: MarkedToken[] = [];
  let offset = 0;
  let r = 0;
  for (const token of tokens) {
    const end = offset + token.content.length;
    let pos = offset;
    while (pos < end) {
      while (r < ranges.length && ranges[r]![1] <= pos) r++;
      const range = ranges[r];
      const inside = range !== undefined && range[0] <= pos;
      const next = Math.min(end, range === undefined ? end : inside ? range[1] : range[0]);
      const part: MarkedToken = { content: token.content.slice(pos - offset, next - offset) };
      if (token.style) part.style = token.style;
      if (inside) part.changed = true;
      result.push(part);
      pos = next;
    }
    offset = end;
  }
  return result;
}

export type TokenRun = { changed: boolean; tokens: Token[] };

/** Groups consecutive tokens by whether they changed, so each changed range renders as one mark. */
export function tokenRuns(tokens: MarkedToken[]): TokenRun[] {
  const runs: TokenRun[] = [];
  for (const { changed = false, ...token } of tokens) {
    const last = runs.at(-1);
    if (last?.changed === changed) last.tokens.push(token);
    else runs.push({ changed, tokens: [token] });
  }
  return runs;
}
