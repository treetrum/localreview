import { describe, expect, test } from "vitest";
import { demoFile } from "../test/fixtures";
import { parseDiff } from "../../../src/parse-diff";
import { compareLines, intralineChanges, matchLines, markTokens, tokenRuns } from "./intraline";

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

/** A re-indented block, as `git diff -w` shows it, with props added between the edited ones. */
const reindented = [
  '      key={account?.account ?? "none"}',
  "      value={account?.account}",
  '      loading={{ isLoading, text: "Loading linked account..." }}',
  "      errorMessage={getErrorMessage()}",
];
const reindentedNew = [
  "          {...field}",
  "          value={value?.account}",
  "          onChange={(event) => {",
  "            onChange(accounts?.find(({ account }) => account === event.target.value));",
  "          }}",
  '          loading={{ isLoading, text: "Loading linked accounts..." }}',
  "          errorMessage={getErrorMessage(fieldState.error?.message)}",
];

describe("matchLines", () => {
  test("does pair each deletion with the addition it resembles when lines were inserted between", () => {
    expect(matchLines(reindented, reindentedNew)).toEqual([
      [1, 1],
      [2, 5],
      [3, 6],
    ]);
  });

  test("does pair lines by position when a run is too large to compare every pair", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `line ${i}`);
    expect(matchLines(lines, lines.toReversed()).slice(0, 2)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });
});

describe("intralineChanges", () => {
  test("does mark only the words that changed when other lines were inserted between", () => {
    const diff = [
      "diff --git a/a.tsx b/a.tsx",
      "--- a/a.tsx",
      "+++ b/a.tsx",
      `@@ -1,${reindented.length} +1,${reindentedNew.length} @@`,
      ...reindented.map((line) => `-${line}`),
      ...reindentedNew.map((line) => `+${line}`),
      "",
    ].join("\n");
    const [file] = parseDiff(diff);
    const changes = intralineChanges(file!, true);
    const text = (key: string, lines: string[], line: number) =>
      changes.get(key)?.map(([start, end]) => lines[line - 1]!.slice(start, end));
    expect(text("old:1", reindented, 1)).toBeUndefined();
    expect(text("old:2", reindented, 2)).toEqual(["account"]);
    expect(text("new:6", reindentedNew, 6)).toEqual(["accounts"]);
    expect(text("new:7", reindentedNew, 7)).toEqual(["fieldState.error?.message"]);
  });

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

describe("tokenRuns", () => {
  test("does group consecutive changed tokens into one run when a range spans several tokens", () => {
    const style = { color: "red" };
    expect(
      tokenRuns([
        { content: "a" },
        { content: "b", changed: true },
        { content: "c", style, changed: true },
        { content: "d", style },
      ]),
    ).toEqual([
      { changed: false, tokens: [{ content: "a" }] },
      { changed: true, tokens: [{ content: "b" }, { content: "c", style }] },
      { changed: false, tokens: [{ content: "d", style }] },
    ]);
  });
});
