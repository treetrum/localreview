import { describe, expect, test } from "vitest";
import { demoFile, mockComment } from "../test/fixtures";
import { fileFingerprint, hasFeedback, linePos, rangeLabel } from "./review";

describe("linePos", () => {
  test("does anchor to the old side when the line is deleted", () => {
    expect(linePos({ type: "del", oldNo: 6, newNo: null, content: "" })).toEqual({
      side: "old",
      line: 6,
    });
  });

  test("does anchor to the new side when the line is context or added", () => {
    expect(linePos({ type: "context", oldNo: 7, newNo: 9, content: "" })).toEqual({
      side: "new",
      line: 9,
    });
  });
});

describe("rangeLabel", () => {
  test("does label a single line", () => {
    expect(rangeLabel({ start: { side: "new", line: 4 }, end: { side: "new", line: 4 } })).toBe(
      "Line 4",
    );
  });

  test("does mark old-side ranges as deleted", () => {
    expect(rangeLabel({ start: { side: "old", line: 4 }, end: { side: "old", line: 4 } })).toBe(
      "Line 4 (deleted)",
    );
    expect(rangeLabel({ start: { side: "old", line: 4 }, end: { side: "old", line: 6 } })).toBe(
      "Lines 4–6 (deleted)",
    );
  });

  test("does name both sides when a range spans them", () => {
    expect(rangeLabel({ start: { side: "old", line: 6 }, end: { side: "new", line: 8 } })).toBe(
      "Lines old 6–new 8",
    );
  });
});

describe("fileFingerprint", () => {
  test("does stay equal when the diff is equal", () => {
    const file = demoFile("src/server.ts");
    expect(fileFingerprint(structuredClone(file))).toBe(fileFingerprint(file));
  });

  test("does change when any line content changes", () => {
    const file = structuredClone(demoFile("src/server.ts"));
    const before = fileFingerprint(file);
    const line = file.hunks[1]?.lines[1];
    if (line) line.content += " ";
    expect(fileFingerprint(file)).not.toBe(before);
  });

  test("does change when a line's type changes", () => {
    const file = structuredClone(demoFile("src/server.ts"));
    const before = fileFingerprint(file);
    const line = file.hunks[0]?.lines[0];
    if (line) line.type = "add";
    expect(fileFingerprint(file)).not.toBe(before);
  });
});

describe("hasFeedback", () => {
  test("does ignore blank summaries and comments", () => {
    expect(hasFeedback({ summary: "  ", comments: [{ ...mockComment, body: " \n" }] })).toBe(false);
  });

  test("does count a non-blank summary or comment", () => {
    expect(hasFeedback({ summary: "ok", comments: [] })).toBe(true);
    expect(hasFeedback({ summary: "", comments: [mockComment] })).toBe(true);
  });
});
