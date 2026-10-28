import { describe, expect, test } from "vitest";
import { demoFiles, demoServerContent, mockComment } from "../test/fixtures";
import { formatReview } from "./format";
import type { ReviewComment } from "./review";
import { buildTree, treeOrder } from "./tree";

const files = treeOrder(buildTree(demoFiles));
const comment = (overrides: Partial<ReviewComment>): ReviewComment => ({
  ...mockComment,
  ...overrides,
});

describe("formatReview", () => {
  test("does format the summary, file comments and line comments with snippets", () => {
    const markdown = formatReview({
      label: "feature vs main",
      files,
      summary: "  Nice work.  ",
      comments: [
        comment({
          id: "range",
          range: { start: { side: "new", line: 6 }, end: { side: "new", line: 8 } },
          snippet: [
            { type: "add", content: "    async fetch(req) {" },
            { type: "add", content: "      const url = new URL(req.url);" },
            {
              type: "add",
              content: '      if (url.pathname === "/health") return new Response("ok");',
            },
          ],
          body: "Extract the routing.",
          createdAt: 3,
        }),
        comment({
          id: "deleted",
          range: { start: { side: "old", line: 6 }, end: { side: "old", line: 6 } },
          snippet: [{ type: "del", content: "    fetch(req) {" }],
          body: "Why make this async?",
          createdAt: 2,
        }),
        comment({
          id: "file",
          range: null,
          snippet: [],
          body: "File-level comment first.",
          createdAt: 4,
        }),
      ],
    });

    expect(markdown).toBe(`# Code review: feature vs main

Please address the following review feedback. Line numbers refer to the new version of each file unless marked as deleted.

## Overall

Nice work.

## \`src/server.ts\`

File-level comment first.

### Line 6 (deleted)

\`\`\`diff
-    fetch(req) {
\`\`\`

Why make this async?

### Lines 6–8

\`\`\`diff
+    async fetch(req) {
+      const url = new URL(req.url);
+      if (url.pathname === "/health") return new Response("ok");
\`\`\`

Extract the routing.
`);
  });

  test("does order files by tree order and append files no longer in the diff", () => {
    const markdown = formatReview({
      label: "x",
      files,
      summary: "",
      comments: [
        comment({ id: "1", path: "zzz/gone.ts", range: null, body: "gone b" }),
        comment({ id: "2", path: "src/server.ts", range: null, body: "server" }),
        comment({ id: "3", path: "aaa/gone.ts", range: null, body: "gone a" }),
        comment({ id: "4", path: "docs/notes.md", range: null, body: "notes" }),
      ],
    });
    const headings = markdown.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## `docs/notes.md`",
      "## `src/server.ts`",
      "## `aaa/gone.ts`",
      "## `zzz/gone.ts`",
    ]);
  });

  test("does break ties between comments on the same line by creation time", () => {
    const markdown = formatReview({
      label: "x",
      files,
      summary: "",
      comments: [
        comment({ id: "b", body: "second", createdAt: 20 }),
        comment({ id: "a", body: "first", createdAt: 10 }),
      ],
    });
    expect(markdown.indexOf("first")).toBeLessThan(markdown.indexOf("second"));
  });

  test("does mark comments outdated when their line is gone", () => {
    const markdown = formatReview({
      label: "x",
      files,
      summary: "",
      comments: [
        comment({ range: { start: { side: "new", line: 99 }, end: { side: "new", line: 99 } } }),
      ],
    });
    expect(markdown).toContain("### Line 99 (outdated)");
  });

  test("does not mark comments outdated when their line is outside the hunks but in the file", () => {
    const withContent = files.map((file) =>
      file.newPath === "src/server.ts" ? { ...file, newContent: demoServerContent } : file,
    );
    const markdown = formatReview({
      label: "x",
      files: withContent,
      summary: "",
      comments: [
        comment({
          range: { start: { side: "new", line: 30 }, end: { side: "new", line: 30 } },
          snippet: [{ type: "context", content: "// line 30" }],
          body: "below",
        }),
        comment({ id: "c2", body: "above" }),
      ],
    });
    expect(markdown).toContain("### Line 30\n");
    expect(markdown.indexOf("above")).toBeLessThan(markdown.indexOf("below"));
  });

  test("does lengthen the fence when the snippet contains backticks", () => {
    const markdown = formatReview({
      label: "x",
      files,
      summary: "",
      comments: [comment({ snippet: [{ type: "context", content: "const s = ````;" }] })],
    });
    expect(markdown).toContain("`````diff\n const s = ````;\n`````");
  });

  test("does skip blank comments and a blank summary", () => {
    const markdown = formatReview({
      label: "x",
      files,
      summary: " ",
      comments: [comment({ body: "  " })],
    });
    expect(markdown).not.toContain("## Overall");
    expect(markdown).not.toContain("src/server.ts");
  });
});
