import { describe, expect, test } from "vitest";
import { lcs } from "./lcs";

const many = (prefix: string) => Array.from({ length: 1500 }, (_, i) => `${prefix}${i}`);

describe("lcs", () => {
  test("does pair a longest common subsequence, including the shared prefix and suffix", () => {
    expect(lcs(["a", "b", "c", "d", "e"], ["a", "x", "c", "y", "e"])).toEqual([
      [0, 0],
      [2, 2],
      [4, 4],
    ]);
  });

  test("does give up when the inputs are too large", () => {
    expect(lcs(many("a"), many("b"))).toBeNull();
  });
});
