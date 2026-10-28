import type { DiffRow } from "./expand";
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
 * run of changes the nth deletion is paired with the nth addition, like GitHub's split view.
 */
export function splitRows(rows: DiffRow[]): SplitRow[] {
  const result: SplitRow[] = [];
  let dels: LineRow[] = [];
  let adds: LineRow[] = [];
  const flush = () => {
    for (let i = 0; i < Math.max(dels.length, adds.length); i++) {
      result.push(pair(dels[i] ?? null, adds[i] ?? null));
    }
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

function pair(left: LineRow | null, right: LineRow | null): PairRow {
  const key = [left, right].map((side) => (side ? posKey(linePos(side.line)) : "")).join("|");
  return { kind: "pair", key, left, right };
}
