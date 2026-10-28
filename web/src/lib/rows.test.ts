import { describe, expect, test } from "vitest";
import { demoFile, demoServerContent } from "../test/fixtures";
import { buildRows, type Span } from "./expand";
import { splitRows, type LineRow, type SplitRow } from "./rows";

const side = (row: LineRow | null) =>
  row && `${row.index} ${row.line.type} ${row.line.oldNo ?? "-"}/${row.line.newNo ?? "-"}`;
const shape = (rows: SplitRow[]) =>
  rows.map((row) =>
    row.kind === "gap" ? (row.header ?? "gap") : [side(row.left), side(row.right)],
  );
const split = (path: string, revealed: Span[] = []) =>
  splitRows(buildRows(demoFile(path), revealed));

describe("splitRows", () => {
  test("does pair deletions with additions and show context on both sides", () => {
    expect(shape(split("src/server.ts"))).toEqual([
      '@@ -3,7 +3,9 @@ import { serve } from "bun";',
      ["0 context 3/3", "0 context 3/3"],
      ["1 context 4/4", "1 context 4/4"],
      ["2 context 5/5", "2 context 5/5"],
      ["3 del 6/-", "4 add -/6"],
      [null, "5 add -/7"],
      [null, "6 add -/8"],
      ["7 context 7/9", "7 context 7/9"],
      ["8 context 8/10", "8 context 8/10"],
      ["9 context 9/11", "9 context 9/11"],
      "@@ -20,3 +22,3 @@ export function stop() {",
      ["10 context 20/22", "10 context 20/22"],
      ["11 del 21/-", "12 add -/23"],
      ["13 context 22/24", "13 context 22/24"],
    ]);
  });

  test("does leave the new side empty when a file is deleted", () => {
    expect(shape(split("docs/notes.md"))).toEqual([
      "@@ -1,2 +0,0 @@",
      ["0 del 1/-", null],
      ["1 del 2/-", null],
    ]);
  });

  test("does show revealed lines on both sides when context is expanded", () => {
    const file = { ...demoFile("src/server.ts"), newContent: demoServerContent };
    const rows = splitRows(buildRows(file, [{ start: 1, end: 2 }]));
    expect(shape(rows).slice(0, 3)).toEqual([
      ["0 context 1/1", "0 context 1/1"],
      ["1 context 2/2", "1 context 2/2"],
      ["2 context 3/3", "2 context 3/3"],
    ]);
  });

  test("does give every row a unique key", () => {
    const keys = split("src/server.ts").map((row) => row.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
