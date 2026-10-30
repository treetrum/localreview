import { describe, expect, test } from "vitest";
import type { CommitInfo } from "../../../shared/types";
import { clickCommit, selectedRange } from "./commits";

const commits: CommitInfo[] = ["e", "d", "c", "b", "a"].map((sha) => ({
  sha,
  subject: sha,
  author: "Test",
  date: "2026-01-01T00:00:00Z",
}));
const range = (from: string, to: string) => ({ kind: "commits" as const, from, to });

describe("clickCommit", () => {
  test("does pick only the clicked commit when not extending", () => {
    expect(clickCommit(commits, range("a", "c"), "d", false)).toEqual(range("d", "d"));
  });

  test("does pick only the clicked commit when extending from a non-commit target", () => {
    expect(clickCommit(commits, { kind: "branch" }, "d", true)).toEqual(range("d", "d"));
  });

  test("does extend to a newer commit when shift-clicking above the selection", () => {
    expect(clickCommit(commits, range("b", "b"), "d", true)).toEqual(range("b", "d"));
  });

  test("does extend to an older commit when shift-clicking below the selection", () => {
    expect(clickCommit(commits, range("c", "d"), "a", true)).toEqual(range("a", "d"));
  });

  test("does shrink the range to the clicked commit when shift-clicking inside it", () => {
    expect(clickCommit(commits, range("a", "e"), "c", true)).toEqual(range("a", "c"));
  });

  test("does pick only the clicked commit when the selection is not in the list", () => {
    expect(clickCommit(commits, range("x", "y"), "c", true)).toEqual(range("c", "c"));
  });
});

describe("selectedRange", () => {
  test("does return the newest and oldest indices when the range is listed", () => {
    expect(selectedRange(commits, range("b", "d"))).toEqual([1, 3]);
  });

  test("does return null when the target is not commits", () => {
    expect(selectedRange(commits, { kind: "staged" })).toBeNull();
  });
});
