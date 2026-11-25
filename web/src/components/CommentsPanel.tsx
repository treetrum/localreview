import { memo, useMemo, useState } from "react";
import { dedent, groupComments } from "../lib/comments";
import { isResolved, rangeLabel, type ReviewComment } from "../lib/review";
import { snippetText } from "./Comment";
import { CircleCheck, RotateCcw, X } from "./icons";
import { Button } from "./ui/Button";
import styles from "./CommentsPanel.module.css";

type Tab = "open" | "resolved";

export type CommentsPanelProps = {
  comments: ReviewComment[];
  /** Diff paths in tree order. */
  paths: string[];
  onJump: (comment: ReviewComment) => void;
  onResolve: (id: string, resolved: boolean) => void;
  onClose: () => void;
};

/** Lines of the commented snippet shown for context; the end of a range is where it's anchored. */
const CONTEXT_LINES = 3;

export const CommentsPanel = memo(function CommentsPanel({
  comments,
  paths,
  onJump,
  onResolve,
  onClose,
}: CommentsPanelProps) {
  const [tab, setTab] = useState<Tab>("open");
  const open = useMemo(() => comments.filter((c) => !isResolved(c)), [comments]);
  const resolved = useMemo(() => comments.filter(isResolved), [comments]);
  const shown = tab === "open" ? open : resolved;
  const groups = useMemo(() => groupComments(shown, paths), [shown, paths]);
  const known = useMemo(() => new Set(paths), [paths]);

  return (
    <section className={styles.panel} aria-label="Comments">
      <header className={styles.header}>
        <h2 className={styles.title}>Comments</h2>
        <div className={styles.tabs}>
          <button
            type="button"
            className={styles.tab}
            aria-pressed={tab === "open"}
            onClick={() => setTab("open")}
          >
            Open <span className={styles.tabCount}>{open.length}</span>
          </button>
          <button
            type="button"
            className={styles.tab}
            aria-pressed={tab === "resolved"}
            onClick={() => setTab("resolved")}
          >
            Resolved <span className={styles.tabCount}>{resolved.length}</span>
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close comments"
          title="Close"
          onClick={onClose}
        >
          <X size={14} />
        </Button>
      </header>

      {groups.length === 0 ? (
        <p className={styles.empty}>
          {tab === "open"
            ? comments.length === 0
              ? "No comments yet. Hover a line and click + to add one."
              : "All comments are resolved."
            : "No resolved comments."}
        </p>
      ) : (
        <ul className={styles.groups}>
          {groups.map(({ path, comments: list }) => {
            const slash = path.lastIndexOf("/");
            const inDiff = known.has(path);
            return (
              <li key={path}>
                <h3 className={styles.file} title={path}>
                  <span className={styles.fileName}>{path.slice(slash + 1)}</span>
                  {slash !== -1 && <span className={styles.dir}>{path.slice(0, slash)}</span>}
                </h3>
                <ul className={styles.items}>
                  {list.map((comment) => (
                    <PanelItem
                      key={comment.id}
                      comment={comment}
                      path={path}
                      inDiff={inDiff}
                      onJump={onJump}
                      onResolve={onResolve}
                    />
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
});

function PanelItem({
  comment,
  path,
  inDiff,
  onJump,
  onResolve,
}: {
  comment: ReviewComment;
  path: string;
  inDiff: boolean;
  onJump: (comment: ReviewComment) => void;
  onResolve: (id: string, resolved: boolean) => void;
}) {
  const location = comment.range ? rangeLabel(comment.range) : "File comment";
  const resolved = isResolved(comment);
  const snippet = snippetText({ snippet: dedent(comment.snippet.slice(-CONTEXT_LINES)) });
  return (
    <li className={styles.item}>
      <button
        type="button"
        className={styles.jump}
        aria-label={`Go to comment: ${location} in ${path}`}
        title={inDiff ? "Show in diff" : "This file is no longer in the diff"}
        disabled={!inDiff}
        onClick={() => onJump(comment)}
      >
        <span className={styles.location}>
          {location}
          {!inDiff && <span className={styles.gone}> · not in this diff</span>}
        </span>
        {snippet && <span className={styles.snippet}>{snippet}</span>}
        <span className={styles.body}>{comment.body}</span>
      </button>
      <Button
        variant="ghost"
        size="icon-xs"
        className={styles.resolve}
        aria-label={resolved ? `Reopen comment: ${location}` : `Resolve comment: ${location}`}
        title={resolved ? "Reopen" : "Resolve"}
        onClick={() => onResolve(comment.id, !resolved)}
      >
        {resolved ? <RotateCcw size={14} /> : <CircleCheck size={14} />}
      </Button>
    </li>
  );
}
