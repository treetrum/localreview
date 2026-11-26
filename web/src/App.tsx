import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { filePath, type DiffResponse, type DiffTarget } from "../../shared/types";
import { commentElementId } from "./components/Comment";
import { CommentsPanel } from "./components/CommentsPanel";
import { DiffPicker } from "./components/DiffPicker";
import { FileDiff } from "./components/FileDiff";
import { FileNav } from "./components/FileNav";
import {
  Check,
  Columns2,
  Copy,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Rows2,
  Space,
  TriangleAlert,
} from "./components/icons";
import { Button } from "./components/ui/Button";
import { Progress } from "./components/ui/Progress";
import { ResizeHandle } from "./components/ui/ResizeHandle";
import { Textarea } from "./components/ui/Textarea";
import { ToggleGroup } from "./components/ui/ToggleGroup";
import { matchesQuery } from "./lib/filter";
import { isTestPath } from "./lib/tests";
import { formatReview } from "./lib/format";
import { cx } from "./lib/cx";
import {
  fileFingerprint,
  hasFeedback,
  isResolved,
  storageKey,
  type ReviewComment,
} from "./lib/review";
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
const isNumber = (value: unknown): value is number => typeof value === "number";

const SIDEBAR = { default: 288, min: 192, max: 640 };
const COMMENTS = { default: 320, min: 240, max: 640 };
/** Room always left for the diff when sizing the side panels. */
const MIN_MAIN = 480;
/** Matches the media query below which the comments panel replaces the file list. */
const ONE_PANEL_BELOW = 1100;

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
  const [hideTests, setHideTests] = useLocalStorage("localreview:hideTests", false, isBoolean);
  const [view, setView] = useLocalStorage<DiffView>("localreview:diffView", "unified", isDiffView);
  const [ignoreWhitespace, setIgnoreWhitespace] = useLocalStorage(
    "localreview:hideWhitespace",
    false,
    isBoolean,
  );
  const [showComments, setShowComments] = useLocalStorage(
    "localreview:commentsPanel",
    false,
    isBoolean,
  );
  const [sidebarWidth, setSidebarWidth] = useLocalStorage(
    "localreview:sidebarWidth",
    SIDEBAR.default,
    isNumber,
  );
  const [commentsWidth, setCommentsWidth] = useLocalStorage(
    "localreview:commentsWidth",
    COMMENTS.default,
    isNumber,
  );
  const windowWidth = useWindowWidth();
  const bothPanels = showComments && windowWidth > ONE_PANEL_BELOW;
  const maxSidebar = panelMax(SIDEBAR, windowWidth - (bothPanels ? commentsWidth : 0));
  const sidebar = clamp(sidebarWidth, SIDEBAR.min, maxSidebar);
  const maxComments = panelMax(COMMENTS, windowWidth - (bothPanels ? sidebar : 0));
  const comments = clamp(commentsWidth, COMMENTS.min, maxComments);
  const [copied, copyText] = useCopy();
  // The browser looks for the URL's #file-… before the diff has loaded, so open and scroll to it
  // on mount instead (this component mounts once the diff is in).
  const [hashPath] = useState(() => {
    const id = hashId(window.location.hash);
    return diff.files.map(filePath).find((path) => fileElementId(path) === id) ?? null;
  });
  const [openRequest, setOpenRequest] = useState<{ path: string; seq: number } | null>(() =>
    hashPath ? { path: hashPath, seq: 1 } : null,
  );
  const openFile = useCallback(
    (path: string) => setOpenRequest((current) => ({ path, seq: (current?.seq ?? 0) + 1 })),
    [],
  );

  const tree = useMemo(() => buildTree(diff.files), [diff.files]);
  const files = useMemo(() => treeOrder(tree), [tree]);
  // By path, not position, so a link still finds its file after the diff changes.
  const fileId = useMemo(
    () => new Map(files.map((file) => [filePath(file), fileElementId(filePath(file))])),
    [files],
  );
  // Viewed marks and the copied review use the full diff, so they don't depend on the toggle.
  const shownFiles = useMemo(
    () =>
      ignoreWhitespace
        ? files.map((file) =>
            file.ignoringWhitespace ? { ...file, ...file.ignoringWhitespace } : file,
          )
        : files,
    [files, ignoreWhitespace],
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
  const nonTestPaths = useMemo(
    () => (hideTests ? matchingPaths.filter((path) => !isTestPath(path)) : matchingPaths),
    [matchingPaths, hideTests],
  );
  const visiblePaths = useMemo(
    () =>
      new Set(hideViewed ? nonTestPaths.filter((path) => !viewedPaths.has(path)) : nonTestPaths),
    [nonTestPaths, hideViewed, viewedPaths],
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
    () =>
      new Map(
        [...commentsByPath].map(([path, list]) => [
          path,
          list.filter((c) => !isResolved(c)).length,
        ]),
      ),
    [commentsByPath],
  );
  const openComments = review.comments.filter((c) => !isResolved(c)).length;
  const feedback = hasFeedback(review);
  const paths = useMemo(() => files.map(filePath), [files]);

  // Scrolls to an element once its file has been expanded (and unhidden) by the jump.
  const [scrollTarget, setScrollTarget] = useState<ScrollTarget | null>(() =>
    hashPath ? { id: fileElementId(hashPath), block: "start", focus: false } : null,
  );
  useEffect(() => {
    if (!scrollTarget) return;
    const frame = requestAnimationFrame(() => {
      const element = document.getElementById(scrollTarget.id);
      element?.scrollIntoView?.({ block: scrollTarget.block });
      if (scrollTarget.focus) element?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [scrollTarget]);

  const revealFile = useCallback(
    (path: string) => {
      if (!matchesQuery(path, query)) setQuery("");
      if (hideViewed && viewedPaths.has(path)) setHideViewed(false);
      if (hideTests && isTestPath(path)) setHideTests(false);
      openFile(path);
    },
    [query, hideViewed, viewedPaths, setHideViewed, hideTests, setHideTests, openFile],
  );

  const jumpToComment = useCallback(
    (comment: ReviewComment) => {
      revealFile(comment.path);
      setScrollTarget({ id: commentElementId(comment.id), block: "center", focus: true });
    },
    [revealFile],
  );

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

  const clearViewed = () => {
    if (window.confirm("Mark all files as unviewed?")) actions.clearViewed();
  };

  return (
    <div
      className={cx(styles.layout, showComments && styles.withComments)}
      style={
        { "--sidebar-width": `${sidebar}px`, "--comments-width": `${comments}px` } as CSSProperties
      }
    >
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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Mark all as unviewed"
            title="Mark all as unviewed"
            disabled={viewedPaths.size === 0}
            onClick={clearViewed}
          >
            <RotateCcw size={14} />
          </Button>
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
            className={styles.toggle}
            aria-label="Hide whitespace"
            aria-pressed={ignoreWhitespace}
            title={ignoreWhitespace ? "Show whitespace changes" : "Hide whitespace changes"}
            onClick={() => setIgnoreWhitespace(!ignoreWhitespace)}
          >
            <Space />
          </Button>
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
          <Button
            variant="outline"
            size="sm"
            className={styles.commentsToggle}
            aria-pressed={showComments}
            title={showComments ? "Hide the comments panel" : "Show all comments"}
            onClick={() => setShowComments(!showComments)}
          >
            <MessageSquare />
            Comments
            {openComments > 0 && <span className={styles.count}>{openComments}</span>}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!feedback && review.comments.length === 0}
            onClick={clear}
          >
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
          hideTests={hideTests}
          onHideTestsChange={setHideTests}
          fileId={fileId}
          viewed={viewedPaths}
          commentCounts={commentCounts}
          onFileOpen={openFile}
        />
        <ResizeHandle
          label="Resize file list"
          value={sidebar}
          min={SIDEBAR.min}
          max={maxSidebar}
          defaultValue={SIDEBAR.default}
          onChange={setSidebarWidth}
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
        ) : nonTestPaths.length === 0 ? (
          <div className={styles.empty}>
            <p>{query ? "All matching files are test files." : "All files are test files."}</p>
            <Button variant="outline" size="sm" onClick={() => setHideTests(false)}>
              Show test files
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

        {shownFiles.map((file, index) => {
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
              openRequest={openRequest?.path === path ? openRequest.seq : 0}
              whitespaceOnly={file.hunks.length === 0 && files[index]!.hunks.length > 0}
            />
          );
        })}
      </main>

      {showComments && (
        <aside className={styles.commentsSidebar}>
          <CommentsPanel
            comments={review.comments}
            paths={paths}
            onJump={jumpToComment}
            onResolve={actions.setResolved}
            onClose={() => setShowComments(false)}
          />
          <ResizeHandle
            label="Resize comments panel"
            edge="left"
            value={comments}
            min={COMMENTS.min}
            max={maxComments}
            defaultValue={COMMENTS.default}
            onChange={setCommentsWidth}
          />
        </aside>
      )}
    </div>
  );
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/** The widest a side panel may be, leaving `MIN_MAIN` for the diff out of `available` pixels. */
const panelMax = (limits: { min: number; max: number }, available: number) =>
  clamp(available - MIN_MAIN, limits.min, limits.max);

function useWindowWidth() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
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

const fileElementId = (path: string) => `file-${path}`;

type ScrollTarget = { id: string; block: ScrollLogicalPosition; focus: boolean };

function hashId(hash: string): string {
  try {
    return decodeURIComponent(hash.slice(1));
  } catch {
    return "";
  }
}
