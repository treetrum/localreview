import type { DiffFile, DiffHunk, FileStatus } from "../shared/types";

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function parseDiff(text: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  for (const line of text.split("\n")) {
    if (line.startsWith("diff --git ")) {
      file = startFile(line.slice("diff --git ".length));
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;

    // Prefixes win over header patterns, so hunk content like "--- a/x" stays content.
    if (hunk) {
      const prefix = line[0];
      if (prefix === "+") {
        hunk.lines.push({ type: "add", oldNo: null, newNo: newNo++, content: line.slice(1) });
        file.additions++;
        continue;
      }
      if (prefix === "-") {
        hunk.lines.push({ type: "del", oldNo: oldNo++, newNo: null, content: line.slice(1) });
        file.deletions++;
        continue;
      }
      if (prefix === " ") {
        hunk.lines.push({
          type: "context",
          oldNo: oldNo++,
          newNo: newNo++,
          content: line.slice(1),
        });
        continue;
      }
      if (prefix === "\\") continue;
    }

    const match = HUNK_HEADER.exec(line);
    if (match) {
      oldNo = Number(match[1]);
      newNo = Number(match[2]);
      hunk = { header: line, oldStart: oldNo, newStart: newNo, lines: [] };
      file.hunks.push(hunk);
    } else if (line.startsWith("new file mode")) {
      file.status = "added";
    } else if (line.startsWith("deleted file mode")) {
      file.status = "deleted";
    } else if (line.startsWith("rename from ")) {
      file.status = "renamed";
      file.oldPath = line.slice("rename from ".length);
    } else if (line.startsWith("rename to ")) {
      file.status = "renamed";
      file.newPath = line.slice("rename to ".length);
    } else if (line.startsWith("Binary files ") || line === "GIT binary patch") {
      file.binary = true;
    }
  }
  return files;
}

function startFile(header: string): DiffFile {
  const [oldPath, newPath] = splitHeaderPaths(header);
  return {
    oldPath,
    newPath,
    status: "modified",
    binary: false,
    additions: 0,
    deletions: 0,
    hunks: [],
  };
}

/**
 * Splits "a/P b/P". Paths may contain spaces, so assume both halves are identical; renames are
 * corrected later from the "rename from/to" lines.
 */
function splitHeaderPaths(header: string): [string, string] {
  const unquoted = header.replaceAll('"', "");
  if (unquoted.length % 2 === 1) {
    const half = (unquoted.length - 1) / 2;
    const a = unquoted.slice(0, half);
    const b = unquoted.slice(half + 1);
    if (a.startsWith("a/") && b.startsWith("b/") && a.slice(2) === b.slice(2)) {
      return [a.slice(2), b.slice(2)];
    }
  }
  const split = unquoted.indexOf(" b/");
  if (split === -1) return [unquoted, unquoted];
  return [unquoted.slice(0, split).replace(/^a\//, ""), unquoted.slice(split + 3)];
}

/** Builds a synthetic all-additions file, e.g. for untracked files. */
export function addedFile(
  path: string,
  content: string,
  status: Extract<FileStatus, "added" | "untracked">,
): DiffFile {
  const lines = content === "" ? [] : content.split("\n");
  if (content.endsWith("\n")) lines.pop();
  const hunks: DiffHunk[] =
    lines.length === 0
      ? []
      : [
          {
            header: `@@ -0,0 +1,${lines.length} @@`,
            oldStart: 0,
            newStart: 1,
            lines: lines.map((line, index) => ({
              type: "add",
              oldNo: null,
              newNo: index + 1,
              content: line,
            })),
          },
        ];
  return {
    oldPath: path,
    newPath: path,
    status,
    binary: false,
    additions: lines.length,
    deletions: 0,
    hunks,
    newContent: content,
  };
}
