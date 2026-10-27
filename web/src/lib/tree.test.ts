import { describe, expect, test } from "vitest";
import type { DiffFile } from "../../../shared/types";
import { buildTree, filterTree, treeOrder, type TreeNode } from "./tree";

const file = (path: string): DiffFile => ({
  oldPath: path,
  newPath: path,
  status: "modified",
  binary: false,
  additions: 0,
  deletions: 0,
  hunks: [],
});

const shape = (nodes: TreeNode[]): unknown[] =>
  nodes.map((node) => (node.kind === "file" ? node.name : { [node.name]: shape(node.children) }));

describe("buildTree", () => {
  test("does put directories before files and sort naturally", () => {
    const tree = buildTree(["b.ts", "step10.ts", "z/x.ts", "step2.ts", "A.ts", "y/w.ts"].map(file));
    expect(shape(tree)).toEqual([
      { y: ["w.ts"] },
      { z: ["x.ts"] },
      "A.ts",
      "b.ts",
      "step2.ts",
      "step10.ts",
    ]);
  });

  test("does compress single-child directory chains", () => {
    const tree = buildTree(
      ["web/src/components/a.tsx", "web/src/components/b.tsx", "web/src/main.tsx"].map(file),
    );
    expect(shape(tree)).toEqual([{ "web/src": [{ components: ["a.tsx", "b.tsx"] }, "main.tsx"] }]);
    expect(tree[0]?.path).toBe("web/src");
  });

  test("does use the old path for deleted files", () => {
    const tree = buildTree([{ ...file("gone.ts"), newPath: "", status: "deleted" }]);
    expect(shape(tree)).toEqual(["gone.ts"]);
  });
});

describe("treeOrder", () => {
  test("does flatten the tree depth-first", () => {
    const tree = buildTree(["z.ts", "a/b.ts", "a/c/d.ts"].map(file));
    expect(treeOrder(tree).map((f) => f.newPath)).toEqual(["a/c/d.ts", "a/b.ts", "z.ts"]);
  });
});

describe("filterTree", () => {
  test("does keep matching files and drop empty directories", () => {
    const tree = buildTree(["a/x.ts", "b/y.ts", "b/z.ts", "root.ts"].map(file));
    expect(shape(filterTree(tree, new Set(["b/z.ts", "root.ts"])))).toEqual([
      { b: ["z.ts"] },
      "root.ts",
    ]);
  });
});
