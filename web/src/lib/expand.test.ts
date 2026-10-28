import { describe, expect, test } from "vitest";
import { parseDiff } from "../../../src/parse-diff";
import { demoFile, demoServerContent, mockComment } from "../test/fixtures";
import { buildRows, commentSpans, rowLines, type DiffRow } from "./expand";

const file = { ...demoFile("src/server.ts"), newContent: demoServerContent };

const gaps = (rows: DiffRow[]) =>
  rows.flatMap((row) =>
    row.kind === "gap"
      ? [{ header: row.header, hidden: row.hidden, up: row.up, down: row.down }]
      : [],
  );

describe("buildRows", () => {
  test("does show only hunk headers when the file has no contents", () => {
    expect(gaps(buildRows(demoFile("src/server.ts"), []))).toEqual([
      {
        header: '@@ -3,7 +3,9 @@ import { serve } from "bun";',
        hidden: { start: 1, end: 2 },
        up: false,
        down: false,
      },
      {
        header: "@@ -20,3 +22,3 @@ export function stop() {",
        hidden: { start: 12, end: 21 },
        up: false,
        down: false,
      },
    ]);
  });

  test("does add expandable gaps above, between and below hunks when contents are available", () => {
    expect(gaps(buildRows(file, []))).toEqual([
      {
        header: '@@ -3,7 +3,9 @@ import { serve } from "bun";',
        hidden: { start: 1, end: 2 },
        up: true,
        down: false,
      },
      {
        header: "@@ -20,3 +22,3 @@ export function stop() {",
        hidden: { start: 12, end: 21 },
        up: true,
        down: true,
      },
      { header: null, hidden: { start: 25, end: 50 }, up: false, down: true },
    ]);
  });

  test("does number revealed lines on the old side shifted by the hunks above", () => {
    const rows = buildRows(file, [{ start: 12, end: 13 }]);
    const revealed = rows.filter((row) => row.kind === "line" && row.expanded);
    expect(revealed.map((row) => row.kind === "line" && row.line)).toEqual([
      { type: "context", oldNo: 10, newNo: 12, content: "// line 12" },
      { type: "context", oldNo: 11, newNo: 13, content: "// line 13" },
    ]);
    expect(gaps(rows)[1]).toEqual({
      header: "@@ -20,3 +22,3 @@ export function stop() {",
      hidden: { start: 14, end: 21 },
      up: true,
      down: true,
    });
  });

  test("does drop the hunk header when the gap above it is fully revealed", () => {
    const rows = buildRows(file, [{ start: 1, end: 50 }]);
    expect(gaps(rows)).toEqual([]);
    expect(rowLines(rows).flatMap((line) => line.newNo ?? [])).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  test("does keep the header on the hidden part next to its hunk when the middle is revealed", () => {
    const rows = buildRows(file, [{ start: 15, end: 15 }]);
    expect(gaps(rows).slice(1, 3)).toEqual([
      { header: null, hidden: { start: 12, end: 14 }, up: true, down: true },
      {
        header: "@@ -20,3 +22,3 @@ export function stop() {",
        hidden: { start: 16, end: 21 },
        up: true,
        down: true,
      },
    ]);
  });

  test("does not expand when the contents don't match the diff", () => {
    const changed = { ...file, newContent: demoServerContent.replace("async fetch", "fetch") };
    expect(
      gaps(buildRows(changed, [{ start: 1, end: 50 }])).every((gap) => !gap.up && !gap.down),
    ).toBe(true);
  });

  test("does place gaps around a hunk with no new-side lines", () => {
    const [deletion] = parseDiff("diff --git a/f b/f\n--- a/f\n+++ b/f\n@@ -3 +2,0 @@\n-c\n");
    const rows = buildRows({ ...deletion!, newContent: "a\nb\nd\ne\n" }, [{ start: 3, end: 3 }]);
    expect(gaps(rows)).toEqual([
      { header: "@@ -3 +2,0 @@", hidden: { start: 1, end: 2 }, up: true, down: false },
      { header: null, hidden: { start: 4, end: 4 }, up: false, down: true },
    ]);
    expect(rowLines(rows)).toEqual([
      { type: "del", oldNo: 3, newNo: null, content: "c" },
      { type: "context", oldNo: 4, newNo: 3, content: "d" },
    ]);
  });
});

const at = (side: "old" | "new", line: number) => ({ side, line });

describe("commentSpans", () => {
  test("does cover the lines between both ends when both are on the new side", () => {
    expect(
      commentSpans([{ ...mockComment, range: { start: at("new", 12), end: at("new", 14) } }]),
    ).toEqual([{ start: 12, end: 14 }]);
  });

  test("does count back from the end using the snippet when the range starts on a deleted line", () => {
    const snippet = [
      { type: "del" as const, content: "x" },
      { type: "add" as const, content: "y" },
      { type: "context" as const, content: "z" },
    ];
    expect(
      commentSpans([
        { ...mockComment, range: { start: at("old", 6), end: at("new", 7) }, snippet },
      ]),
    ).toEqual([{ start: 6, end: 7 }]);
  });

  test("does skip file-level comments and ranges entirely on the old side", () => {
    expect(
      commentSpans([
        { ...mockComment, range: null },
        { ...mockComment, range: { start: at("old", 6), end: at("old", 6) } },
      ]),
    ).toEqual([]);
  });
});
