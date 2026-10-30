import { stat } from "node:fs/promises";
import { basename, join } from "node:path";
import {
  filePath,
  type CommitInfo,
  type DiffFile,
  type DiffRequest,
  type DiffResponse,
  type DiffTarget,
} from "../shared/types";
import { addedFile, parseDiff } from "./parse-diff";

export const MAX_CONTENT_BYTES = 512 * 1024;
export const MAX_BRANCH_COMMITS = 200;
export const RECENT_COMMITS = 20;
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
  target: DiffTarget;
  baseSha: string;
  label: string;
  diffArgs: string[];
  newSide: NewSide;
  includeUntracked: boolean;
};

type Repo = {
  root: string;
  branch: string | null;
  head: string | null;
  base: string | null;
  /** null when there's no HEAD or base, or they share no history. */
  mergeBase: string | null;
};

export async function loadDiff(cwd: string, request: DiffRequest = {}): Promise<DiffResponse> {
  const root = (await git(cwd, ["rev-parse", "--show-toplevel"])).trim();
  const [branch, head, base] = await Promise.all([
    tryGit(root, ["symbolic-ref", "--short", "-q", "HEAD"]).then((out) => out?.trim() || null),
    tryGit(root, ["rev-parse", "--verify", "-q", "HEAD"]).then((out) => out?.trim() || null),
    request.base ?? defaultBase(root),
  ]);
  const baseSha = base === null ? null : await verifyCommit(root, base);
  const mergeBase =
    head && baseSha ? ((await tryGit(root, ["merge-base", baseSha, head]))?.trim() ?? null) : null;
  const repo: Repo = { root, branch, head, base, mergeBase };

  const target = request.target ?? { kind: base === null ? "uncommitted" : "branch" };
  const [resolved, branches, commitList] = await Promise.all([
    resolveTarget(repo, target),
    listBranches(root),
    listCommits(repo),
  ]);

  const raw = await git(root, [
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
  await mapConcurrent(files, (file) => loadContents(root, resolved, file));

  if (resolved.includeUntracked) {
    const untracked = (await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).split(
      "\0",
    );
    files.push(
      ...(await mapConcurrent(untracked.filter(Boolean), (path) => untrackedFile(root, path))),
    );
  }

  files.sort((a, b) => compareCodeUnits(filePath(a), filePath(b)));

  return {
    repoName: basename(root),
    repoRoot: root,
    branch,
    label: resolved.label,
    target: resolved.target,
    base,
    baseSha: resolved.baseSha,
    branches,
    ...commitList,
    files,
  };
}

async function resolveTarget(repo: Repo, target: DiffTarget): Promise<Resolved> {
  const { root, branch, head } = repo;
  const on = branch ?? head?.slice(0, 7) ?? "HEAD";

  switch (target.kind) {
    case "uncommitted":
    case "staged": {
      const baseSha = head ?? (await emptyTree(root));
      const staged = target.kind === "staged";
      return {
        target,
        baseSha,
        label: `${staged ? "Staged" : "Uncommitted"} changes on ${on}`,
        diffArgs: staged ? ["--cached", baseSha] : [baseSha],
        newSide: staged ? { kind: "index" } : { kind: "worktree" },
        includeUntracked: !staged,
      };
    }

    case "commits": {
      const [from, to] = await Promise.all([
        verifyCommit(root, target.from),
        verifyCommit(root, target.to),
      ]);
      if ((await tryGit(root, ["merge-base", "--is-ancestor", from, to])) === null) {
        throw new GitError(`${target.from} is not an ancestor of ${target.to}`);
      }
      const parent = (await tryGit(root, ["rev-parse", "--verify", "-q", `${from}^`]))?.trim();
      const baseSha = parent || (await emptyTree(root));
      return {
        target: { kind: "commits", from, to },
        baseSha,
        label: await commitsLabel(root, from, to, parent),
        diffArgs: [baseSha, to],
        newSide: { kind: "rev", sha: to },
        includeUntracked: false,
      };
    }

    case "branch": {
      if (repo.base === null) {
        throw new GitError(
          "Couldn't find a main or master branch. Pick a base branch to compare against.",
        );
      }
      if (head && !repo.mergeBase) {
        throw new GitError(`${on} and ${repo.base} have no common history`);
      }
      const baseSha = repo.mergeBase ?? (await emptyTree(root));
      return {
        target,
        baseSha,
        label: `${on} vs ${repo.base}`,
        diffArgs: [baseSha],
        newSide: { kind: "worktree" },
        includeUntracked: true,
      };
    }
  }
}

async function commitsLabel(
  root: string,
  from: string,
  to: string,
  parent: string | undefined,
): Promise<string> {
  if (from === to) {
    const [short = to, subject = ""] = (await git(root, ["log", "-1", "--format=%h%x00%s", to]))
      .trim()
      .split("\0");
    return `${short} ${subject}`.trim();
  }
  const [count, fromShort, toShort] = await Promise.all([
    git(root, ["rev-list", "--count", to, ...(parent ? ["--not", parent] : [])]),
    git(root, ["rev-parse", "--short", from]),
    git(root, ["rev-parse", "--short", to]),
  ]);
  return `${fromShort.trim()}..${toShort.trim()} (${count.trim()} commits)`;
}

async function listBranches(root: string): Promise<string[]> {
  const out = await git(root, [
    "for-each-ref",
    "--format=%(refname:short)%00%(symref)",
    "refs/heads",
    "refs/remotes",
  ]);
  return out
    .split("\n")
    .map((line) => line.split("\0"))
    .filter(([name, symref]) => name && !symref)
    .map(([name]) => name as string);
}

async function listCommits(repo: Repo): Promise<Pick<DiffResponse, "commits" | "commitsScope">> {
  if (!repo.head) return { commits: [], commitsScope: "recent" };
  if (repo.mergeBase) {
    const commits = await log(repo.root, [
      `-${MAX_BRANCH_COMMITS}`,
      `${repo.mergeBase}..${repo.head}`,
    ]);
    if (commits.length > 0) return { commits, commitsScope: "branch" };
  }
  return {
    commits: await log(repo.root, [`-${RECENT_COMMITS}`, repo.head]),
    commitsScope: "recent",
  };
}

async function log(root: string, args: string[]): Promise<CommitInfo[]> {
  const out = await git(root, ["log", "--format=%H%x00%s%x00%an%x00%aI%x1e", ...args]);
  return out
    .split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", subject = "", author = "", date = ""] = record.split("\0");
      return { sha, subject, author, date };
    });
}

async function verifyCommit(repoRoot: string, ref: string): Promise<string> {
  const sha = await tryGit(repoRoot, ["rev-parse", "--verify", "-q", `${ref}^{commit}`]);
  if (!sha) throw new GitError(`Unknown revision: ${ref}`);
  return sha.trim();
}

async function defaultBase(repoRoot: string): Promise<string | null> {
  const [main, master, originHead] = await Promise.all([
    tryGit(repoRoot, ["rev-parse", "--verify", "-q", "main^{commit}"]),
    tryGit(repoRoot, ["rev-parse", "--verify", "-q", "master^{commit}"]),
    tryGit(repoRoot, ["symbolic-ref", "--short", "-q", "refs/remotes/origin/HEAD"]),
  ]);
  if (main) return "main";
  if (master) return "master";
  return originHead?.trim() || null;
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
