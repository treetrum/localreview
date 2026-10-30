import { useCallback, useMemo, useState } from "react";
import { filePath, type DiffResponse, type DiffTarget } from "../../shared/types";
import { DiffPicker } from "./components/DiffPicker";
import { FileDiff } from "./components/FileDiff";
import { FileNav } from "./components/FileNav";
import { Check, Columns2, Copy, RefreshCw, Rows2, TriangleAlert } from "./components/icons";
import { Button } from "./components/ui/Button";
import { Progress } from "./components/ui/Progress";
import { Textarea } from "./components/ui/Textarea";
import { ToggleGroup } from "./components/ui/ToggleGroup";
import { matchesQuery } from "./lib/filter";
import { formatReview } from "./lib/format";
import { fileFingerprint, hasFeedback, storageKey, type ReviewComment } from "./lib/review";
import { isDiffView, type DiffView } from "./lib/rows";
import { buildTree, filterTree, treeOrder } from "./lib/tree";
import { useCopy } from "./lib/useCopy";
import { useDiff } from "./lib/useDiff";
import { useDiffRequest } from "./lib/useDiffRequest";
import { useLocalStorage } from "./lib/useLocalStorage";
import { useReview } from "./lib/useReview";
import styles from "./App.module.css";

export function App() {
  const [request, setRequest] = useDiffRequest();
  const { data, error, loading, refresh } = useDiff(request);
  const changeTarget = useCallback(
    (target: DiffTarget) => setRequest({ ...request, target }),
    [request, setRequest],
  );
  const changeBase = useCallback(
    (base: string) => setRequest({ target: { kind: "branch" }, base }),
    [setRequest],
  );
  const isDefault = request.target === undefined && request.base === undefined;

  if (!data) {
    if (error) {
      return (
        <main className={styles.state}>
          <TriangleAlert size={24} />
          <h1>Couldn't load the diff</h1>
          <pre className={styles.errorText}>{error}</pre>
          <div className={styles.stateActions}>
            <Button onClick={refresh} disabled={loading}>
              Try again
            </Button>
            {!isDefault && (
              <Button variant="outline" onClick={() => setRequest({})}>
                Show the default diff
              </Button>
            )}
          </div>
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
      onTargetChange={changeTarget}
      onBaseChange={changeBase}
    />
  );
}

const EMPTY_COMMENTS: ReviewComment[] = [];
const isBoolean = (value: unknown): value is boolean => typeof value === "boolean";

type ReviewProps = {
  diff: DiffResponse;
  error: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  onTargetChange: (target: DiffTarget) => void;
  onBaseChange: (base: string) => void;
};

function Review({ diff, error, refreshing, onRefresh, onTargetChange, onBaseChange }: ReviewProps) {
  const { review, actions } = useReview(storageKey(diff));
  const [query, setQuery] = useState("");
  const [hideViewed, setHideViewed] = useLocalStorage("localreview:hideViewed", false, isBoolean);
  const [view, setView] = useLocalStorage<DiffView>("localreview:diffView", "unified", isDiffView);
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
  const viewedPaths = useMemo(
    () =>
      new Set(
        [...fingerprints].filter(([path, fp]) => review.viewed[path] === fp).map(([path]) => path),
      ),
    [fingerprints, review.viewed],
  );
  const matchingPaths = useMemo(
    () => files.map(filePath).filter((path) => matchesQuery(path, query)),
    [files, query],
  );
  const visiblePaths = useMemo(
    () =>
      new Set(hideViewed ? matchingPaths.filter((path) => !viewedPaths.has(path)) : matchingPaths),
    [matchingPaths, hideViewed, viewedPaths],
  );
  const visibleFiles = useMemo(
    () => files.filter((file) => visiblePaths.has(filePath(file))),
    [files, visiblePaths],
  );
  const visibleTree = useMemo(
    () => (visiblePaths.size === files.length ? tree : filterTree(tree, visiblePaths)),
    [tree, files.length, visiblePaths],
  );

  const commentsByPath = useStableGroups(review.comments);
  const commentCounts = useMemo(
    () => new Map([...commentsByPath].map(([path, list]) => [path, list.length])),
    [commentsByPath],
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
          <DiffPicker diff={diff} onTargetChange={onTargetChange} onBaseChange={onBaseChange} />
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
          <ToggleGroup
            label="Diff view"
            value={view}
            onChange={setView}
            options={[
              { value: "unified", label: "Unified view", icon: <Rows2 /> },
              { value: "split", label: "Split view", icon: <Columns2 /> },
            ]}
          />
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
          hideViewed={hideViewed}
          onHideViewedChange={setHideViewed}
          fileId={fileId}
          viewed={viewedPaths}
          commentCounts={commentCounts}
        />
      </aside>

      <main className={styles.main}>
        {error && (
          <p className={styles.banner} role="alert">
            <TriangleAlert size={16} /> Couldn't load the diff: {error}
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
        ) : matchingPaths.length === 0 ? (
          <div className={styles.empty}>
            <p>No files match “{query}”.</p>
            <Button variant="outline" size="sm" onClick={() => setQuery("")}>
              Clear filter
            </Button>
          </div>
        ) : (
          visibleFiles.length === 0 && (
            <div className={styles.empty}>
              <p>{query ? "All matching files are viewed." : "All files are viewed."}</p>
              <Button variant="outline" size="sm" onClick={() => setHideViewed(false)}>
                Show viewed files
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
              view={view}
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
