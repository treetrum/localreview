import type { DiffRow } from "./expand";
import { matchLines } from "./intraline";
import { linePos, posKey } from "./review";

export type DiffView = "unified" | "split";
export const isDiffView = (value: unknown): value is DiffView =>
  value === "unified" || value === "split";

export type LineRow = Extract<DiffRow, { kind: "line" }>;
export type GapRow = Extract<DiffRow, { kind: "gap" }>;
export type PairRow = { kind: "pair"; key: string; left: LineRow | null; right: LineRow | null };
export type SplitRow = GapRow | PairRow;

/**
 * Old lines on the left, new lines on the right. Context lines appear on both sides; within each
 * run of changes, lines `matchLines` pairs share a row, and the rest fill rows between them in order.
 */
export function splitRows(rows: DiffRow[]): SplitRow[] {
  const result: SplitRow[] = [];
  let dels: LineRow[] = [];
  let adds: LineRow[] = [];
  const flush = () => {
    let i = 0;
    let j = 0;
    const fill = (endI: number, endJ: number) => {
      while (i < endI || j < endJ) {
        result.push(pair(i < endI ? dels[i++]! : null, j < endJ ? adds[j++]! : null));
      }
    };
    for (const [matchI, matchJ] of matchLines(dels.map(content), adds.map(content))) {
      fill(matchI, matchJ);
      result.push(pair(dels[i++]!, adds[j++]!));
    }
    fill(dels.length, adds.length);
    dels = [];
    adds = [];
  };
  for (const row of rows) {
    if (row.kind === "line" && row.line.type === "del") dels.push(row);
    else if (row.kind === "line" && row.line.type === "add") adds.push(row);
    else {
      flush();
      result.push(row.kind === "gap" ? row : pair(row, row));
    }
  }
  flush();
  return result;
}

const content = (row: LineRow) => row.line.content;

function pair(left: LineRow | null, right: LineRow | null): PairRow {
  const key = [left, right].map((side) => (side ? posKey(linePos(side.line)) : "")).join("|");
  return { kind: "pair", key, left, right };
}
