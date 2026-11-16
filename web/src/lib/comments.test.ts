import { describe, expect, test } from "vitest";
import { mockComment } from "../test/fixtures";
import { groupComments } from "./comments";
import type { ReviewComment } from "./review";

const at = (id: string, path: string, line: number | null, createdAt = 1): ReviewComment => ({
  ...mockComment,
  id,
  path,
  createdAt,
  range: line === null ? null : { start: { side: "new", line }, end: { side: "new", line } },
});

describe("groupComments", () => {
  test("does order files by the given paths and append unknown files sorted", () => {
    const groups = groupComments(
      [at("1", "z.ts", 1), at("2", "gone/b.ts", 1), at("3", "a.ts", 1), at("4", "gone/a.ts", 1)],
      ["z.ts", "a.ts"],
    );
    expect(groups.map((g) => g.path)).toEqual(["z.ts", "a.ts", "gone/a.ts", "gone/b.ts"]);
  });

  test("does put file comments first, then sort by end line and creation time", () => {
    const [group] = groupComments(
      [
        at("late", "a.ts", 8, 3),
        at("early", "a.ts", 8, 2),
        at("top", "a.ts", 2),
        at("file", "a.ts", null),
      ],
      ["a.ts"],
    );
    expect(group?.comments.map((c) => c.id)).toEqual(["file", "top", "early", "late"]);
  });
});
