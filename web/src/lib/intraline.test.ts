import { describe, expect, test } from "vitest";
import { demoFile } from "../test/fixtures";
import { compareLines, intralineChanges, markTokens } from "./intraline";

/** The changed text on each side, rather than offsets. */
function changed(oldText: string, newText: string, ignoreWhitespace = false) {
  const ranges = compareLines(oldText, newText, ignoreWhitespace);
  return (
    ranges && {
      old: ranges.old.map(([start, end]) => oldText.slice(start, end)),
      new: ranges.new.map(([start, end]) => newText.slice(start, end)),
    }
  );
}

describe("compareLines", () => {
  test("does mark only the words that changed on each side", () => {
    expect(changed('console.log("old");', 'console.log("new");')).toEqual({
      old: ["old"],
      new: ["new"],
    });
  });

  test("does mark nothing on the side a word was only inserted into", () => {
    expect(changed("fetch(req) {", "async fetch(req) {")).toEqual({ old: [], new: ["async "] });
  });

  test("does join changed words separated only by whitespace", () => {
    expect(changed("const a = foo bar;", "const a = baz qux;")).toEqual({
      old: ["foo bar"],
      new: ["baz qux"],
    });
  });

  test("does mark changed indentation unless whitespace is ignored", () => {
    expect(changed("if (x) {", "  if (x) {")).toEqual({ old: [], new: ["  "] });
    expect(changed("if (x) {", "  if (x) {", true)).toEqual({ old: [], new: [] });
  });

  test("does skip lines that have too little in common", () => {
    expect(changed("totally different", "nothing alike at all")).toBeNull();
  });
});

describe("intralineChanges", () => {
  test("does pair the nth deletion with the nth addition in each run of changes", () => {
    const changes = intralineChanges(demoFile("src/server.ts"));
    expect(Object.fromEntries(changes)).toEqual({
      "new:6": [[4, 10]],
      "old:21": [[15, 18]],
      "new:23": [[15, 18]],
    });
  });
});

describe("markTokens", () => {
  test("does split tokens at range boundaries and keep their styles", () => {
    const style = { color: "red" };
    expect(
      markTokens(
        [{ content: "ab" }, { content: "cdef", style }],
        [
          [1, 3],
          [4, 5],
        ],
      ),
    ).toEqual([
      { content: "a" },
      { content: "b", changed: true },
      { content: "c", style, changed: true },
      { content: "d", style },
      { content: "e", style, changed: true },
      { content: "f", style },
    ]);
  });
});
