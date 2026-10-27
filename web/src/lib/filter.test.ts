import { describe, expect, test } from "vitest";
import { matchesQuery } from "./filter";

describe("matchesQuery", () => {
  test("does match everything when the query is blank", () => {
    expect(matchesQuery("src/a.ts", "  ")).toBe(true);
  });

  test("does match case-insensitively", () => {
    expect(matchesQuery("src/Server.ts", "SERVER")).toBe(true);
  });

  test("does require every term when the query has several", () => {
    expect(matchesQuery("web/src/components/FileDiff.tsx", "web diff")).toBe(true);
    expect(matchesQuery("web/src/components/FileDiff.tsx", "web nav")).toBe(false);
  });
});
