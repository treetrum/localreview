import { describe, expect, test } from "vitest";
import { addedFile, parseDiff } from "./parse-diff";

describe("parseDiff", () => {
  test("does number old and new lines when parsing a modified file", () => {
    const [file] = parseDiff(
      [
        "diff --git a/src/a.ts b/src/a.ts",
        "index 1111111..2222222 100644",
        "--- a/src/a.ts",
        "+++ b/src/a.ts",
        "@@ -3,3 +3,3 @@ function f() {",
        " keep",
        "-old",
        "+new",
        " tail",
        "",
      ].join("\n"),
    );
    expect(file).toMatchObject({
      oldPath: "src/a.ts",
      newPath: "src/a.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
    });
    expect(file?.hunks[0]).toEqual({
      header: "@@ -3,3 +3,3 @@ function f() {",
      oldStart: 3,
      newStart: 3,
      lines: [
        { type: "context", oldNo: 3, newNo: 3, content: "keep" },
        { type: "del", oldNo: 4, newNo: null, content: "old" },
        { type: "add", oldNo: null, newNo: 4, content: "new" },
        { type: "context", oldNo: 5, newNo: 5, content: "tail" },
      ],
    });
  });

  test("does treat header-like content as lines when inside a hunk", () => {
    const [file] = parseDiff(
      [
        "diff --git a/notes.md b/notes.md",
        "--- a/notes.md",
        "+++ b/notes.md",
        "@@ -1,2 +1,2 @@",
        "--- a/old",
        "+++ b/new",
        " @@ -1 +1 @@",
      ].join("\n"),
    );
    expect(file?.hunks).toHaveLength(1);
    expect(file?.hunks[0]?.lines.map((line) => [line.type, line.content])).toEqual([
      ["del", "-- a/old"],
      ["add", "++ b/new"],
      ["context", "@@ -1 +1 @@"],
    ]);
  });

  test("does keep paths intact when they contain spaces", () => {
    const [file] = parseDiff(
      ["diff --git a/my dir/b c.txt b/my dir/b c.txt", "@@ -1 +1 @@", "-x", "+y"].join("\n"),
    );
    expect(file?.oldPath).toBe("my dir/b c.txt");
    expect(file?.newPath).toBe("my dir/b c.txt");
  });

  test("does read paths from rename lines when a file is renamed", () => {
    const [file] = parseDiff(
      [
        "diff --git a/old name.ts b/new name.ts",
        "similarity index 90%",
        "rename from old name.ts",
        "rename to new name.ts",
      ].join("\n"),
    );
    expect(file).toMatchObject({
      oldPath: "old name.ts",
      newPath: "new name.ts",
      status: "renamed",
    });
  });

  test("does set status and binary from extended headers", () => {
    const files = parseDiff(
      [
        "diff --git a/new.ts b/new.ts",
        "new file mode 100644",
        "@@ -0,0 +1 @@",
        "+hi",
        "\\ No newline at end of file",
        "diff --git a/gone.ts b/gone.ts",
        "deleted file mode 100644",
        "@@ -1 +0,0 @@",
        "-bye",
        "diff --git a/img.png b/img.png",
        "Binary files a/img.png and b/img.png differ",
      ].join("\n"),
    );
    expect(files.map((f) => [f.newPath, f.status, f.binary])).toEqual([
      ["new.ts", "added", false],
      ["gone.ts", "deleted", false],
      ["img.png", "modified", true],
    ]);
    expect(files[0]?.hunks[0]?.lines).toHaveLength(1);
  });

  test("does return no files when the diff is empty", () => {
    expect(parseDiff("")).toEqual([]);
  });
});

describe("addedFile", () => {
  test("does not add a phantom final line when content ends with a newline", () => {
    const file = addedFile("a.txt", "one\ntwo\n", "untracked");
    expect(file.hunks[0]?.header).toBe("@@ -0,0 +1,2 @@");
    expect(file.hunks[0]?.lines.map((line) => [line.newNo, line.content])).toEqual([
      [1, "one"],
      [2, "two"],
    ]);
    expect(file.additions).toBe(2);
  });

  test("does keep the last line when content has no trailing newline", () => {
    expect(addedFile("a.txt", "one\ntwo", "added").additions).toBe(2);
  });

  test("does produce no hunks when the file is empty", () => {
    const file = addedFile("empty.txt", "", "untracked");
    expect(file.hunks).toEqual([]);
    expect(file.additions).toBe(0);
  });
});
