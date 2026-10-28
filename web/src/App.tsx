import { useCallback, useMemo, useState } from "react";
import { filePath, type DiffResponse } from "../../shared/types";
import { FileDiff } from "./components/FileDiff";
import { FileNav } from "./components/FileNav";
import { Check, Copy, RefreshCw, TriangleAlert } from "./components/icons";
import { Button } from "./components/ui/Button";
import { Progress } from "./components/ui/Progress";
import { Textarea } from "./components/ui/Textarea";
import { matchesQuery } from "./lib/filter";
import { formatReview } from "./lib/format";
import { fileFingerprint, hasFeedback, storageKey, type ReviewComment } from "./lib/review";
import { buildTree, filterTree, treeOrder } from "./lib/tree";
import { useCopy } from "./lib/useCopy";
import { useDiff } from "./lib/useDiff";
import { useReview } from "./lib/useReview";
import styles from "./App.module.css";

export function App() {
  const { data, error, loading, refresh } = useDiff();

  if (!data) {
    if (error) {
      return (
        <main className={styles.state}>
          <TriangleAlert size={24} />
          <h1>Couldn't load the diff</h1>
          <pre className={styles.errorText}>{error}</pre>
          <Button onClick={refresh} disabled={loading}>
            Try again
          </Button>
        </main>
      );
    }
    return (
      <main className={styles.state} aria-busy="true">
        <p>Loading diff…</p>
      </main>
    );
  }

  return (
    <Review
      key={storageKey(data)}
      diff={data}
      error={error}
      refreshing={loading}
      onRefresh={refresh}
    />
  );
}

const EMPTY_COMMENTS: ReviewComment[] = [];

type ReviewProps = {
  diff: DiffResponse;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
};

function Review({ diff, error, refreshing, onRefresh }: ReviewProps) {
  const { review, actions } = useReview(storageKey(diff));
  const [query, setQuery] = useState("");
  const [copied, copyText] = useCopy();

  const tree = useMemo(() => buildTree(diff.files), [diff.files]);
  const files = useMemo(() => treeOrder(tree), [tree]);
  const fileId = useMemo(
    () => new Map(files.map((file, index) => [filePath(file), `file-${index}`])),
    [files],
  );
  const fingerprints = useMemo(
    () => new Map(files.map((file) => [filePath(file), fileFingerprint(file)])),
    [files],
  );
  const visiblePaths = useMemo(
    () => new Set(files.map(filePath).filter((path) => matchesQuery(path, query))),
    [files, query],
  );
  const visibleFiles = useMemo(
    () => files.filter((file) => visiblePaths.has(filePath(file))),
    [files, visiblePaths],
  );
  const visibleTree = useMemo(
    () => (query ? filterTree(tree, visiblePaths) : tree),
    [tree, query, visiblePaths],
  );

  const commentsByPath = useStableGroups(review.comments);
  const commentCounts = useMemo(
    () => new Map([...commentsByPath].map(([path, list]) => [path, list.length])),
    [commentsByPath],
  );
  const viewedPaths = useMemo(
    () =>
      new Set(
        [...fingerprints].filter(([path, fp]) => review.viewed[path] === fp).map(([path]) => path),
      ),
    [fingerprints, review.viewed],
  );

  const feedback = hasFeedback(review);

  const copy = useCallback(
    () =>
      copyText(
        formatReview({
          label: diff.label,
          files,
          summary: review.summary,
          comments: review.comments,
        }),
      ),
    [copyText, diff.label, files, review.summary, review.comments],
  );

  const clear = () => {
    if (window.confirm("Clear all comments and overall feedback? Viewed files stay marked.")) {
      actions.clear();
    }
  };

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div className={styles.title}>
          <h1 className={styles.repo}>{diff.repoName}</h1>
          <span className={styles.label}>{diff.label}</span>
          <code className={styles.sha} title={diff.baseSha}>
            {diff.baseSha.slice(0, 7)}
          </code>
        </div>
        <div className={styles.progress}>
          <Progress
            value={viewedPaths.size}
            max={Math.max(files.length, 1)}
            aria-label="Review progress"
          />
          <span>
            {viewedPaths.size}/{files.length} viewed
          </span>
        </div>
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh"
            title="Reload the diff from git"
            disabled={refreshing}
            onClick={onRefresh}
          >
            <RefreshCw className={refreshing ? styles.spinning : undefined} />
          </Button>
          <Button variant="outline" size="sm" disabled={!feedback} onClick={clear}>
            Clear
          </Button>
          <Button size="sm" disabled={!feedback} onClick={() => void copy()}>
            {copied ? <Check /> : <Copy />}
            {copied ? "Copied" : "Copy review"}
          </Button>
        </div>
      </header>

      <aside className={styles.sidebar}>
        <FileNav
          tree={visibleTree}
          files={visibleFiles}
          totalCount={files.length}
          query={query}
          onQueryChange={setQuery}
          fileId={fileId}
          viewed={viewedPaths}
          commentCounts={commentCounts}
        />
      </aside>

      <main className={styles.main}>
        {error && (
          <p className={styles.banner} role="alert">
            <TriangleAlert size={16} /> Couldn't refresh: {error}
          </p>
        )}
        <section className={styles.summary}>
          <label htmlFor="overall-feedback" className={styles.summaryLabel}>
            Overall feedback
          </label>
          <Textarea
            id="overall-feedback"
            placeholder="Feedback on the change as a whole"
            value={review.summary}
            onChange={(event) => actions.setSummary(event.target.value)}
          />
        </section>

        {files.length === 0 ? (
          <p className={styles.empty}>No changes for {diff.label}.</p>
        ) : (
          visibleFiles.length === 0 && (
            <div className={styles.empty}>
              <p>No files match “{query}”.</p>
              <Button variant="outline" size="sm" onClick={() => setQuery("")}>
                Clear filter
              </Button>
            </div>
          )
        )}

        {files.map((file) => {
          const path = filePath(file);
          return (
            <FileDiff
              key={path}
              file={file}
              id={fileId.get(path) ?? ""}
              path={path}
              fingerprint={fingerprints.get(path) ?? ""}
              viewed={viewedPaths.has(path)}
              comments={commentsByPath.get(path) ?? EMPTY_COMMENTS}
              actions={actions}
              hidden={!visiblePaths.has(path)}
            />
          );
        })}
      </main>
    </div>
  );
}

/** Groups comments by path, reusing the previous array for paths whose comments didn't change. */
function useStableGroups(comments: ReviewComment[]): ReadonlyMap<string, ReviewComment[]> {
  const [groups, setGroups] = useState(() => groupByPath(comments, new Map()));
  const [prevComments, setPrevComments] = useState(comments);
  if (comments !== prevComments) {
    setPrevComments(comments);
    setGroups(groupByPath(comments, groups));
  }
  return groups;
}

function groupByPath(
  comments: ReviewComment[],
  previous: ReadonlyMap<string, ReviewComment[]>,
): ReadonlyMap<string, ReviewComment[]> {
  const next = new Map<string, ReviewComment[]>();
  for (const comment of comments) {
    next.set(comment.path, [...(next.get(comment.path) ?? []), comment]);
  }
  for (const [path, list] of next) {
    const old = previous.get(path);
    if (old && old.length === list.length && old.every((c, i) => c === list[i])) {
      next.set(path, old);
    }
  }
  return next;
}
