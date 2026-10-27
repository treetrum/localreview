import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { filePath, type DiffFile, type DiffResponse } from "../shared/types";
import { addedFile, parseDiff } from "./parse-diff";

export type DiffTarget =
  | { kind: "branch"; base?: string }
  | { kind: "staged" }
  | { kind: "commit"; sha: string };

export const MAX_CONTENT_BYTES = 512 * 1024;
const BINARY_SNIFF_BYTES = 8 * 1024;
const CONCURRENCY = 16;

export class GitError extends Error {
  override name = "GitError";
}

export async function git(cwd: string, args: string[]): Promise<string> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new GitError(stderr.trim() || `git ${args[0]} exited with code ${code}`);
  return stdout;
}

export async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch (error) {
    if (error instanceof GitError) return null;
    throw error;
  }
}

/** Where the new side of each file comes from. */
type NewSide = { kind: "worktree" } | { kind: "index" } | { kind: "rev"; sha: string };

type Resolved = {
  baseRef: string;
  baseSha: string;
  label: string;
  diffArgs: string[];
  newSide: NewSide;
  includeUntracked: boolean;
};

export async function loadDiff(cwd: string, target: DiffTarget): Promise<DiffResponse> {
  const repoRoot = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const branch =
    (await tryGit(repoRoot, ["symbolic-ref", "--short", "-q", "HEAD"]))?.trim() || null;
  const resolved = await resolveTarget(repoRoot, branch, target);

  const raw = await git(repoRoot, [
    "-c",
    "core.quotePath=false",
    "diff",
    "--no-color",
    "--no-ext-diff",
    "--no-relative",
    "--src-prefix=a/",
    "--dst-prefix=b/",
    "-M",
    ...resolved.diffArgs,
    "--",
  ]);
  const files = parseDiff(raw);
  await mapConcurrent(files, (file) => loadContents(repoRoot, resolved, file));

  if (resolved.includeUntracked) {
    const untracked = (
      await git(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z"])
    ).split("\0");
    files.push(
      ...(await mapConcurrent(untracked.filter(Boolean), (path) => untrackedFile(repoRoot, path))),
    );
  }

  files.sort((a, b) => compareCodeUnits(filePath(a), filePath(b)));

  return {
    repoName: basename(repoRoot),
    repoRoot,
    branch,
    label: resolved.label,
    baseRef: resolved.baseRef,
    baseSha: resolved.baseSha,
    files,
  };
}

async function resolveTarget(
  repoRoot: string,
  branch: string | null,
  target: DiffTarget,
): Promise<Resolved> {
  const head = (await tryGit(repoRoot, ["rev-parse", "--verify", "-q", "HEAD"]))?.trim() ?? null;

  if (target.kind === "staged") {
    const baseSha = head ?? (await emptyTree(repoRoot));
    return {
      baseRef: "HEAD",
      baseSha,
      label: `Staged changes on ${branch ?? "HEAD"}`,
      diffArgs: ["--cached", baseSha],
      newSide: { kind: "index" },
      includeUntracked: false,
    };
  }

  if (target.kind === "commit") {
    const sha = await verifyCommit(repoRoot, target.sha);
    const parent = (await tryGit(repoRoot, ["rev-parse", "--verify", "-q", `${sha}^`]))?.trim();
    const baseSha = parent || (await emptyTree(repoRoot));
    const [short = sha, subject = ""] = (
      await git(repoRoot, ["log", "-1", "--format=%h%x00%s", sha])
    )
      .trim()
      .split("\0");
    return {
      baseRef: `${short}^`,
      baseSha,
      label: `${short} ${subject}`.trim(),
      diffArgs: [baseSha, sha],
      newSide: { kind: "rev", sha },
      includeUntracked: false,
    };
  }

  const baseRef = target.base ?? (await defaultBase(repoRoot));
  const baseSha = head
    ? (await git(repoRoot, ["merge-base", await verifyCommit(repoRoot, baseRef), head])).trim()
    : await emptyTree(repoRoot);
  return {
    baseRef,
    baseSha,
    label: `${branch ?? head?.slice(0, 7) ?? "HEAD"} vs ${baseRef}`,
    diffArgs: [baseSha],
    newSide: { kind: "worktree" },
    includeUntracked: true,
  };
}

async function verifyCommit(repoRoot: string, ref: string): Promise<string> {
  const sha = await tryGit(repoRoot, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
  if (!sha) throw new GitError(`Unknown revision: ${ref}`);
  return sha.trim();
}

async function defaultBase(repoRoot: string): Promise<string> {
  const [main, master, originHead] = await Promise.all([
    tryGit(repoRoot, ["rev-parse", "--verify", "-q", "main^{commit}"]),
    tryGit(repoRoot, ["rev-parse", "--verify", "-q", "master^{commit}"]),
    tryGit(repoRoot, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"]),
  ]);
  if (main) return "main";
  if (master) return "master";
  if (originHead?.trim()) return originHead.trim();
  throw new GitError(
    "Couldn't find a main or master branch. Pass a base ref, e.g. `localreview develop`.",
  );
}

async function emptyTree(repoRoot: string): Promise<string> {
  return (await git(repoRoot, ["hash-object", "-t", "tree", "/dev/null"])).trim();
}

async function loadContents(repoRoot: string, resolved: Resolved, file: DiffFile): Promise<void> {
  if (file.binary) return;
  const [oldContent, newContent] = await Promise.all([
    file.status === "added"
      ? undefined
      : readRevision(repoRoot, `${resolved.baseSha}:${file.oldPath}`),
    file.status === "deleted" ? undefined : readNewSide(repoRoot, resolved.newSide, file.newPath),
  ]);
  if (oldContent !== undefined) file.oldContent = oldContent;
  if (newContent !== undefined) file.newContent = newContent;
}

async function readNewSide(
  repoRoot: string,
  side: NewSide,
  path: string,
): Promise<string | undefined> {
  if (side.kind === "index") return readRevision(repoRoot, `:${path}`);
  if (side.kind === "rev") return readRevision(repoRoot, `${side.sha}:${path}`);
  try {
    const file = Bun.file(join(repoRoot, path));
    if (file.size > MAX_CONTENT_BYTES) return undefined;
    return await file.text();
  } catch {
    return undefined;
  }
}

async function readRevision(repoRoot: string, spec: string): Promise<string | undefined> {
  const size = await tryGit(repoRoot, ["cat-file", "-s", spec]);
  if (size === null || Number(size) > MAX_CONTENT_BYTES) return undefined;
  return (await tryGit(repoRoot, ["show", spec])) ?? undefined;
}

async function untrackedFile(repoRoot: string, path: string): Promise<DiffFile> {
  const binary: DiffFile = {
    oldPath: path,
    newPath: path,
    status: "untracked",
    binary: true,
    additions: 0,
    deletions: 0,
    hunks: [],
  };
  try {
    const absolute = join(repoRoot, path);
    const info = await stat(absolute);
    if (!info.isFile() || info.size > MAX_CONTENT_BYTES) return binary;
    const bytes = await Bun.file(absolute).bytes();
    if (bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0)) return binary;
    return addedFile(path, new TextDecoder().decode(bytes), "untracked");
  } catch {
    return binary;
  }
}

function compareCodeUnits(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

async function mapConcurrent<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let next = 0;
  async function worker(): Promise<void> {
    if (next >= items.length) return;
    const index = next++;
    results[index] = await fn(items[index] as T);
    return worker();
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return results;
}
