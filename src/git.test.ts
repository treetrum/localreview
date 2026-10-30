import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { filePath } from "../shared/types";
import { GitError, loadDiff, MAX_CONTENT_BYTES } from "./git";
import { createTestRepo, type TestRepo } from "./test-repo";

let repo: TestRepo;

beforeEach(() => {
  repo = createTestRepo();
  repo.write("keep.ts", "one\ntwo\nthree\n");
  repo.write("gone.ts", "bye\n");
  repo.write("old-name.ts", "a\nb\nc\nd\ne\nf\n");
  repo.commit("initial");
});

afterEach(() => repo.remove());

const summary = (files: Awaited<ReturnType<typeof loadDiff>>["files"]) =>
  files.map((file) => [filePath(file), file.status]);

describe("loadDiff", () => {
  test("does include committed, uncommitted and untracked changes when targeting the branch", async () => {
    repo.git("checkout", "-q", "-b", "feature");
    repo.write("keep.ts", "one\nTWO\nthree\n");
    repo.commit("change keep");
    repo.write("gone.ts", "bye\nagain\n");
    repo.write("new dir/fresh.ts", "fresh\n");

    const diff = await loadDiff(repo.root, { target: { kind: "branch" } });

    expect(diff.label).toBe("feature vs main");
    expect(diff.branch).toBe("feature");
    expect(diff.base).toBe("main");
    expect(diff.baseSha).toBe(repo.git("rev-parse", "main"));
    expect(summary(diff.files)).toEqual([
      ["gone.ts", "modified"],
      ["keep.ts", "modified"],
      ["new dir/fresh.ts", "untracked"],
    ]);
    const keep = diff.files.find((file) => file.newPath === "keep.ts");
    expect(keep?.oldContent).toBe("one\ntwo\nthree\n");
    expect(keep?.newContent).toBe("one\nTWO\nthree\n");
  });

  test("does diff against the merge-base when main has moved on", async () => {
    repo.git("checkout", "-q", "-b", "feature");
    repo.write("keep.ts", "feature\n");
    repo.commit("feature work");
    repo.git("checkout", "-q", "main");
    repo.write("main-only.ts", "main\n");
    repo.commit("main work");
    repo.git("checkout", "-q", "feature");

    const diff = await loadDiff(repo.root, { target: { kind: "branch" } });
    expect(summary(diff.files)).toEqual([["keep.ts", "modified"]]);
  });

  test("does use the given base ref when one is passed", async () => {
    const first = repo.git("rev-parse", "HEAD");
    repo.write("keep.ts", "changed\n");
    repo.commit("second");

    const diff = await loadDiff(repo.root, { target: { kind: "branch" }, base: first });
    expect(diff.label).toBe(`main vs ${first}`);
    expect(summary(diff.files)).toEqual([["keep.ts", "modified"]]);
  });

  test("does fall back to master when there is no main", async () => {
    repo.git("branch", "-m", "main", "master");
    repo.git("checkout", "-q", "-b", "feature");
    expect((await loadDiff(repo.root, { target: { kind: "branch" } })).label).toBe(
      "feature vs master",
    );
  });

  test("does throw a GitError when no base branch can be found", async () => {
    repo.git("branch", "-m", "main", "trunk");
    await expect(loadDiff(repo.root, { target: { kind: "branch" } })).rejects.toBeInstanceOf(
      GitError,
    );
  });

  test("does throw a GitError when the base ref is unknown", async () => {
    await expect(loadDiff(repo.root, { target: { kind: "branch" }, base: "nope" })).rejects.toThrow(
      "Unknown revision: nope",
    );
  });

  test("does detect renames and deletions", async () => {
    repo.git("mv", "old-name.ts", "new-name.ts");
    repo.git("rm", "-q", "gone.ts");

    const diff = await loadDiff(repo.root, { target: { kind: "branch" } });
    expect(diff.files.map((file) => [file.oldPath, file.newPath, file.status])).toEqual([
      ["gone.ts", "gone.ts", "deleted"],
      ["old-name.ts", "new-name.ts", "renamed"],
    ]);
    const gone = diff.files[0];
    expect(gone?.oldContent).toBe("bye\n");
    expect(gone?.newContent).toBeUndefined();
  });

  test("does include only the index when targeting staged changes", async () => {
    repo.write("keep.ts", "staged\n");
    repo.git("add", "keep.ts");
    repo.write("keep.ts", "staged\nunstaged\n");
    repo.write("untracked.ts", "x\n");

    const diff = await loadDiff(repo.root, { target: { kind: "staged" } });
    expect(diff.label).toBe("Staged changes on main");
    expect(summary(diff.files)).toEqual([["keep.ts", "modified"]]);
    expect(diff.files[0]?.newContent).toBe("staged\n");
  });

  test("does diff against the empty tree when staging in a repo without commits", async () => {
    const empty = createTestRepo();
    try {
      empty.write("first.ts", "hello\n");
      empty.git("add", "first.ts");
      const diff = await loadDiff(empty.root, { target: { kind: "staged" } });
      expect(summary(diff.files)).toEqual([["first.ts", "added"]]);
    } finally {
      empty.remove();
    }
  });

  test("does show a single commit when targeting a commit", async () => {
    repo.write("keep.ts", "one\ntwo\nthree\nfour\n");
    const sha = repo.commit("add four");
    repo.write("keep.ts", "later\n");
    repo.commit("later");

    const diff = await loadDiff(repo.root, { target: { kind: "commits", from: sha, to: sha } });
    expect(diff.label).toBe(`${sha.slice(0, 7)} add four`);
    expect(summary(diff.files)).toEqual([["keep.ts", "modified"]]);
    expect(diff.files[0]?.newContent).toBe("one\ntwo\nthree\nfour\n");
  });

  test("does diff against the empty tree when the commit is the root", async () => {
    const root = repo.git("rev-list", "--max-parents=0", "HEAD");
    const diff = await loadDiff(repo.root, { target: { kind: "commits", from: root, to: root } });
    expect(summary(diff.files)).toEqual([
      ["gone.ts", "added"],
      ["keep.ts", "added"],
      ["old-name.ts", "added"],
    ]);
  });

  test("does diff the working tree and untracked files against HEAD when targeting uncommitted changes", async () => {
    repo.git("checkout", "-q", "-b", "feature");
    repo.write("gone.ts", "committed\n");
    repo.commit("committed");
    repo.write("keep.ts", "staged\n");
    repo.git("add", "keep.ts");
    repo.write("keep.ts", "staged\nunstaged\n");
    repo.write("untracked.ts", "x\n");

    const diff = await loadDiff(repo.root, { target: { kind: "uncommitted" } });
    expect(diff.label).toBe("Uncommitted changes on feature");
    expect(diff.baseSha).toBe(repo.git("rev-parse", "HEAD"));
    expect(summary(diff.files)).toEqual([
      ["keep.ts", "modified"],
      ["untracked.ts", "untracked"],
    ]);
    expect(diff.files[0]?.newContent).toBe("staged\nunstaged\n");
  });

  test("does default to uncommitted changes when no base branch can be found", async () => {
    repo.git("branch", "-m", "main", "trunk");
    repo.write("keep.ts", "changed\n");

    const diff = await loadDiff(repo.root);
    expect(diff.target).toEqual({ kind: "uncommitted" });
    expect(diff.base).toBeNull();
    expect(summary(diff.files)).toEqual([["keep.ts", "modified"]]);
  });

  test("does default to the branch vs main when there is no target", async () => {
    const diff = await loadDiff(repo.root);
    expect(diff.target).toEqual({ kind: "branch" });
    expect(diff.label).toBe("main vs main");
  });

  test("does diff a range of commits from the parent of the oldest to the newest", async () => {
    const before = repo.git("rev-parse", "HEAD");
    const from = repo.commit("empty");
    repo.write("keep.ts", "one\n");
    repo.write("gone.ts", "changed\n");
    const to = repo.commit("change both");
    repo.write("keep.ts", "later\n");
    repo.commit("later");

    const diff = await loadDiff(repo.root, {
      target: { kind: "commits", from: from.slice(0, 7), to: "HEAD~1" },
    });
    expect(diff.target).toEqual({ kind: "commits", from, to });
    expect(diff.baseSha).toBe(before);
    expect(diff.label).toBe(`${from.slice(0, 7)}..${to.slice(0, 7)} (2 commits)`);
    expect(summary(diff.files)).toEqual([
      ["gone.ts", "modified"],
      ["keep.ts", "modified"],
    ]);
    expect(diff.files[1]?.newContent).toBe("one\n");
  });

  test("does throw a GitError when the range is reversed", async () => {
    const from = repo.git("rev-parse", "HEAD");
    const to = repo.commit("second");
    await expect(
      loadDiff(repo.root, { target: { kind: "commits", from: to, to: from } }),
    ).rejects.toThrow(`${to} is not an ancestor of ${from}`);
  });

  test("does list the commits on the branch since the merge-base, newest first", async () => {
    repo.git("checkout", "-q", "-b", "feature");
    const first = repo.commit("first");
    const second = repo.commit("second");
    repo.git("branch", "other");
    repo.git("update-ref", "refs/remotes/origin/main", "main");
    repo.git("symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");

    const diff = await loadDiff(repo.root);
    expect(diff.commitsScope).toBe("branch");
    expect(diff.commits.map((c) => [c.sha, c.subject])).toEqual([
      [second, "second"],
      [first, "first"],
    ]);
    expect(diff.commits[0]?.author).toBe(repo.git("log", "-1", "--format=%an", second));
    expect(diff.branches).toEqual(["feature", "main", "other", "origin/main"]);
  });

  test("does list recent commits when the branch has none of its own", async () => {
    const second = repo.commit("second");
    const diff = await loadDiff(repo.root, { target: { kind: "uncommitted" } });
    expect(diff.commitsScope).toBe("recent");
    expect(diff.commits.map((c) => c.sha)).toEqual([second, repo.git("rev-parse", "HEAD~1")]);
  });

  test("does list no commits in a repo without commits", async () => {
    const empty = createTestRepo();
    try {
      const diff = await loadDiff(empty.root, { target: { kind: "uncommitted" } });
      expect(diff.commits).toEqual([]);
      expect(diff.branches).toEqual([]);
    } finally {
      empty.remove();
    }
  });

  test("does mark untracked files binary when they contain NUL bytes or are too large", async () => {
    repo.write("blob.bin", new Uint8Array([1, 0, 2]));
    repo.write("huge.txt", "x".repeat(MAX_CONTENT_BYTES + 1));
    repo.write("empty.txt", "");

    const diff = await loadDiff(repo.root, { target: { kind: "branch" } });
    expect(diff.files.map((file) => [file.newPath, file.binary, file.hunks.length])).toEqual([
      ["blob.bin", true, 0],
      ["empty.txt", false, 0],
      ["huge.txt", true, 0],
    ]);
  });

  test("does skip contents when a tracked file is over the size limit", async () => {
    repo.write("keep.ts", "y".repeat(MAX_CONTENT_BYTES + 1));
    const diff = await loadDiff(repo.root, { target: { kind: "branch" } });
    expect(diff.files[0]?.oldContent).toBe("one\ntwo\nthree\n");
    expect(diff.files[0]?.newContent).toBeUndefined();
  });

  test("does report the repo root when started in a subdirectory", async () => {
    repo.write("sub/file.ts", "x\n");
    const diff = await loadDiff(`${repo.root}/sub`, { target: { kind: "branch" } });
    expect(summary(diff.files)).toEqual([["sub/file.ts", "untracked"]]);
    expect(diff.repoRoot.endsWith(repo.root.split("/").at(-1) ?? "")).toBe(true);
  });
});
