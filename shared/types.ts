export type FileStatus = "added" | "deleted" | "modified" | "renamed" | "untracked";

export type DiffLineType = "add" | "del" | "context";

export type DiffLine = {
  type: DiffLineType;
  oldNo: number | null;
  newNo: number | null;
  content: string;
};

export type DiffHunk = {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
};

export type DiffFile = {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  /** Full contents for highlighting; omitted if binary or too large. */
  oldContent?: string;
  newContent?: string;
};

/** What to diff. `commits` spans `from` (oldest) to `to` (newest), both inclusive. */
export type DiffTarget =
  | { kind: "branch" }
  | { kind: "uncommitted" }
  | { kind: "staged" }
  | { kind: "commits"; from: string; to: string };

/**
 * A diff request. `base` is the branch that `branch` compares against and that bounds the commit
 * list; it defaults to main/master. Without a target, the branch is diffed if a base can be found,
 * otherwise the uncommitted changes.
 */
export type DiffRequest = { target?: DiffTarget; base?: string };

export type CommitInfo = { sha: string; subject: string; author: string; date: string };

export type DiffResponse = {
  repoName: string;
  repoRoot: string;
  branch: string | null;
  /** e.g. "feature vs main" */
  label: string;
  /** The target that was diffed, with commit refs resolved to full SHAs. */
  target: DiffTarget;
  /** The base branch, or null if none was given and there's no main/master. */
  base: string | null;
  /** The commit the old side of the diff comes from (or the empty tree). */
  baseSha: string;
  /** Local and remote branches, for picking a base. */
  branches: string[];
  /** Newest first: the commits since the merge-base with `base`, or recent history if none. */
  commits: CommitInfo[];
  commitsScope: "branch" | "recent";
  files: DiffFile[];
};

export type ErrorResponse = { error: string };

export function filePath(file: DiffFile): string {
  return file.status === "deleted" ? file.oldPath : file.newPath;
}

export function toSearchParams({ target, base }: DiffRequest): URLSearchParams {
  const params = new URLSearchParams();
  if (target) params.set("target", target.kind);
  if (target?.kind === "commits") {
    params.set("from", target.from);
    params.set("to", target.to);
  }
  if (base) params.set("base", base);
  return params;
}

/** Throws on a malformed request, so a bad URL fails loudly rather than diffing something else. */
export function fromSearchParams(params: URLSearchParams): DiffRequest {
  const request: DiffRequest = {};
  const base = params.get("base");
  if (base) request.base = base;
  const kind = params.get("target");
  switch (kind) {
    case null:
      return request;
    case "branch":
    case "uncommitted":
    case "staged":
      return { ...request, target: { kind } };
    case "commits": {
      const from = params.get("from");
      const to = params.get("to");
      if (!from || !to) throw new Error("A commit range needs both `from` and `to`");
      return { ...request, target: { kind, from, to } };
    }
    default:
      throw new Error(`Unknown diff target: ${kind}`);
  }
}
