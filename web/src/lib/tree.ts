import { filePath, type DiffFile } from "../../../shared/types";

export type TreeDir = { kind: "dir"; name: string; path: string; children: TreeNode[] };
export type TreeFile = { kind: "file"; name: string; path: string; file: DiffFile };
export type TreeNode = TreeDir | TreeFile;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
  return collator.compare(a.name, b.name) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
}

/** Directories first, then files, naturally sorted; single-child directory chains are merged. */
export function buildTree(files: DiffFile[]): TreeNode[] {
  const root: TreeDir = { kind: "dir", name: "", path: "", children: [] };
  for (const file of files) {
    const path = filePath(file);
    const parts = path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      const dirPath = dir.path ? `${dir.path}/${part}` : part;
      let next = dir.children.find(
        (child): child is TreeDir => child.kind === "dir" && child.name === part,
      );
      if (!next) {
        next = { kind: "dir", name: part, path: dirPath, children: [] };
        dir.children.push(next);
      }
      dir = next;
    }
    dir.children.push({ kind: "file", name: parts.at(-1) ?? path, path, file });
  }
  return finish(root.children);
}

function finish(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((node) => {
      if (node.kind === "file") return node;
      let dir: TreeDir = { ...node, children: finish(node.children) };
      while (dir.children.length === 1 && dir.children[0]?.kind === "dir") {
        const only: TreeDir = dir.children[0];
        dir = { ...only, name: `${dir.name}/${only.name}` };
      }
      return dir;
    })
    .toSorted(compareNodes);
}

export function treeOrder(nodes: TreeNode[]): DiffFile[] {
  return nodes.flatMap((node) => (node.kind === "file" ? [node.file] : treeOrder(node.children)));
}

/** Keeps files whose path is in `paths`, and the directories that contain them. */
export function filterTree(nodes: TreeNode[], paths: ReadonlySet<string>): TreeNode[] {
  return nodes.flatMap((node): TreeNode[] => {
    if (node.kind === "file") return paths.has(node.path) ? [node] : [];
    const children = filterTree(node.children, paths);
    return children.length > 0 ? [{ ...node, children }] : [];
  });
}
