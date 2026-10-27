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

export type DiffResponse = {
  repoName: string;
  repoRoot: string;
  branch: string | null;
  /** e.g. "feature vs main" */
  label: string;
  baseRef: string;
  baseSha: string;
  files: DiffFile[];
};

export type ErrorResponse = { error: string };

export function filePath(file: DiffFile): string {
  return file.status === "deleted" ? file.oldPath : file.newPath;
}
