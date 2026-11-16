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
const MIN_SIMILARITY = 0.4;

const WORD = /[\p{L}\p{N}_]+|\s+|[^\p{L}\p{N}_\s]/gu;
const isBlank = (text: string) => /^\s*$/.test(text);

/**
 * The changed parts of modified lines, keyed by `posKey`. Within each run of changes the nth
 * deletion is compared with the nth addition, word by word, as on GitHub.
 */
export function intralineChanges(file: DiffFile, ignoreWhitespace = false): Map<string, Range[]> {
  const result = new Map<string, Range[]>();
  for (const hunk of file.hunks) {
    let dels: DiffLine[] = [];
    let adds: DiffLine[] = [];
    const flush = () => {
      for (let i = 0; i < Math.min(dels.length, adds.length); i++) {
        const del = dels[i]!;
        const add = adds[i]!;
        const ranges = compareLines(del.content, add.content, ignoreWhitespace);
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

export function compareLines(
  oldText: string,
  newText: string,
  ignoreWhitespace = false,
): { old: Range[]; new: Range[] } | null {
  if (oldText.length > MAX_LENGTH || newText.length > MAX_LENGTH) return null;
  const a = oldText.match(WORD) ?? [];
  const b = newText.match(WORD) ?? [];
  const pairs = lcs(a, b);
  if (!pairs) return null;

  const common = pairs.reduce((sum, [i]) => sum + (isBlank(a[i]!) ? 0 : a[i]!.length), 0);
  const longest = Math.max(oldText.replace(/\s/g, "").length, newText.replace(/\s/g, "").length);
  if (longest === 0 || common / longest < MIN_SIMILARITY) return null;

  const oldKept = new Set(pairs.map(([i]) => i));
  const newKept = new Set(pairs.map(([, j]) => j));
  return {
    old: changedRanges(a, oldKept, ignoreWhitespace),
    new: changedRanges(b, newKept, ignoreWhitespace),
  };
}

/** Ranges of the tokens not kept, joined across whitespace so "a b" is one range, not two. */
function changedRanges(tokens: string[], kept: Set<number>, ignoreWhitespace: boolean): Range[] {
  const ranges: Range[] = [];
  let offset = 0;
  let between = "";
  tokens.forEach((token, index) => {
    const start = offset;
    offset += token.length;
    if (kept.has(index) || (ignoreWhitespace && isBlank(token))) {
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
