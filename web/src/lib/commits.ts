import type { CommitInfo, DiffTarget } from "../../../shared/types";

type CommitsTarget = Extract<DiffTarget, { kind: "commits" }>;

/** Indices into `commits` (newest first) of the selected range, as [newest, oldest]. */
export function selectedRange(commits: CommitInfo[], target: DiffTarget): [number, number] | null {
  if (target.kind !== "commits") return null;
  const newest = commits.findIndex((c) => c.sha === target.to);
  const oldest = commits.findIndex((c) => c.sha === target.from);
  return newest < 0 || oldest < 0 ? null : [newest, oldest];
}

/**
 * The target after clicking a commit. A plain click picks that commit alone; a shift-click extends
 * the current selection to it, keeping the oldest end unless the click is older still.
 */
export function clickCommit(
  commits: CommitInfo[],
  current: DiffTarget,
  sha: string,
  extend: boolean,
): CommitsTarget {
  const range = selectedRange(commits, current);
  const clicked = commits.findIndex((c) => c.sha === sha);
  if (!extend || !range || clicked < 0) return { kind: "commits", from: sha, to: sha };
  const [newest, oldest] = range;
  const anchor = clicked > oldest ? newest : oldest;
  const from = commits[Math.max(anchor, clicked)]?.sha ?? sha;
  const to = commits[Math.min(anchor, clicked)]?.sha ?? sha;
  return { kind: "commits", from, to };
}
