import { describe, expect, test } from "vitest";
import { parseDiff } from "../../../src/parse-diff";
import { demoFile } from "../test/fixtures";
import { hideWhitespace } from "./whitespace";

const file = (hunks: string) =>
  parseDiff(`diff --git a/f.ts b/f.ts\n--- a/f.ts\n+++ b/f.ts\n${hunks}`)[0]!;

const shape = (hunks: ReturnType<typeof hideWhitespace>["hunks"]) =>
  hunks.map((hunk) => [
    hunk.header,
    ...hunk.lines.map(
      (line) => `${line.type} ${line.oldNo ?? "-"}/${line.newNo ?? "-"} ${line.content}`,
    ),
  ]);

describe("hideWhitespace", () => {
  test("does turn lines that only changed indentation into context", () => {
    const result = hideWhitespace(
      file(`@@ -1,4 +1,5 @@ function x() {
 a
-if (x) {
-  y();
+if (z) {
+  if (x) {
+    y();
 }
`),
    );
    expect(shape(result.hunks)).toEqual([
      [
        "@@ -1,4 +1,5 @@ function x() {",
        "context 1/1 a",
        "add -/2 if (z) {",
        "context 2/3   if (x) {",
        "context 3/4     y();",
        "context 4/5 }",
      ],
    ]);
    expect([result.additions, result.deletions]).toEqual([1, 0]);
  });

  test("does split a hunk around the changes left and drop whitespace-only ones", () => {
    const result = hideWhitespace(
      file(`@@ -1,10 +1,10 @@ top
-a
+  a
 b
 c
 d
 e
-f
+F
 g
 h
 i
-j
+j   
`),
    );
    expect(shape(result.hunks)).toEqual([
      [
        "@@ -3,7 +3,7 @@ top",
        "context 3/3 c",
        "context 4/4 d",
        "context 5/5 e",
        "del 6/- f",
        "add -/6 F",
        "context 7/7 g",
        "context 8/8 h",
        "context 9/9 i",
      ],
    ]);
  });

  test("does leave a file without whitespace-only changes as it is", () => {
    const original = demoFile("src/server.ts");
    expect(hideWhitespace(original)).toBe(original);
  });

  test("does drop every hunk when only whitespace changed", () => {
    expect(hideWhitespace(file("@@ -1 +1 @@\n-a  b\n+a b\n")).hunks).toEqual([]);
  });
});
