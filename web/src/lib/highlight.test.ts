import { describe, expect, test } from "vitest";
import { detectLanguage, lineTokens } from "./highlight";

describe("detectLanguage", () => {
  test("does recognise special file names", () => {
    expect(detectLanguage("Dockerfile")).toBe("docker");
    expect(detectLanguage("sub/Makefile")).toBe("make");
    expect(detectLanguage(".env.local")).toBe("dotenv");
  });

  test("does map extension aliases and bundled ids", () => {
    expect(detectLanguage("a.mjs")).toBe("javascript");
    expect(detectLanguage("a.h")).toBe("c");
    expect(detectLanguage("a.ts")).toBe("ts");
    expect(detectLanguage("a.py")).toBe("py");
  });

  test("does return null when the language is unknown", () => {
    expect(detectLanguage("notes.unknownext")).toBeNull();
    expect(detectLanguage("LICENSE")).toBeNull();
  });
});

describe("lineTokens", () => {
  const tokens = [[{ content: "const " }, { content: "a" }], [{ content: "b" }]];

  test("does return the line's tokens when the text matches", () => {
    expect(lineTokens(tokens, 1, "const a")).toBe(tokens[0]);
  });

  test("does ignore a trailing carriage return", () => {
    expect(lineTokens(tokens, 2, "b\r")).toBe(tokens[1]);
  });

  test("does return null when the file changed since the diff", () => {
    expect(lineTokens(tokens, 1, "const b")).toBeNull();
    expect(lineTokens(tokens, 3, "c")).toBeNull();
    expect(lineTokens(undefined, 1, "const a")).toBeNull();
  });
});
