import { memo, useMemo, useRef, useState, type MouseEvent } from "react";
import type { DiffFile, DiffLine } from "../../../shared/types";
import { cx } from "../lib/cx";
import { lineTokens, type Token } from "../lib/highlight";
import { flattenLines, linePos, posKey, type ReviewComment } from "../lib/review";
import type { ReviewActions } from "../lib/useReview";
import { useHighlightedFile } from "../lib/useHighlightedFile";
import { CommentCard, CommentForm } from "./Comment";
import { FileStatusBadge } from "./FileStatusBadge";
import { ChevronDown, ChevronRight, MessageSquare, Plus } from "./icons";
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import styles from "./FileDiff.module.css";

export type FileDiffProps = {
  file: DiffFile;
  /** DOM id, used by the sidebar's anchor links. */
  id: string;
  path: string;
  fingerprint: string;
  viewed: boolean;
  comments: ReviewComment[];
  actions: ReviewActions;
  hidden?: boolean;
};

type Row =
  | { kind: "hunk"; header: string; key: string }
  | { kind: "line"; line: DiffLine; index: number };
type Selection = { anchor: number; focus: number };

const PREFIX = { add: "+", del: "-", context: " " } as const;

export const FileDiff = memo(function FileDiff({
  file,
  id,
  path,
  fingerprint,
  viewed,
  comments,
  actions,
  hidden = false,
}: FileDiffProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const highlighted = useHighlightedFile(sectionRef, file);

  // Follow `viewed` when it changes, but let the user expand a viewed file manually.
  const [collapsed, setCollapsed] = useState(viewed);
  const [prevViewed, setPrevViewed] = useState(viewed);
  if (viewed !== prevViewed) {
    setPrevViewed(viewed);
    setCollapsed(viewed);
  }

  const [selection, setSelection] = useState<Selection | null>(null);
  const [dragging, setDragging] = useState(false);
  const [fileDraft, setFileDraft] = useState(false);

  const lines = useMemo(() => flattenLines(file), [file]);
  const rows = useMemo(() => {
    const result: Row[] = [];
    let index = 0;
    for (const hunk of file.hunks) {
      result.push({
        kind: "hunk",
        header: hunk.header,
        key: `hunk:${hunk.oldStart}:${hunk.newStart}`,
      });
      for (const line of hunk.lines) result.push({ kind: "line", line, index: index++ });
    }
    return result;
  }, [file]);

  const { fileComments, outdated, byEnd } = useMemo(() => {
    const positions = new Set(lines.map((line) => posKey(linePos(line))));
    const grouped = {
      fileComments: [] as ReviewComment[],
      outdated: [] as ReviewComment[],
      byEnd: new Map<string, ReviewComment[]>(),
    };
    for (const comment of comments.toSorted((a, b) => a.createdAt - b.createdAt)) {
      if (!comment.range) grouped.fileComments.push(comment);
      else if (!positions.has(posKey(comment.range.end))) grouped.outdated.push(comment);
      else {
        const key = posKey(comment.range.end);
        grouped.byEnd.set(key, [...(grouped.byEnd.get(key) ?? []), comment]);
      }
    }
    return grouped;
  }, [comments, lines]);

  const [lo, hi] = selection
    ? [Math.min(selection.anchor, selection.focus), Math.max(selection.anchor, selection.focus)]
    : [-1, -1];

  const toggleCollapsed = (next: boolean) => {
    const section = sectionRef.current;
    const header = parseFloat(getComputedStyle(document.documentElement).fontSize) * 3.5;
    // When collapsing a file whose top has scrolled away, jump back to its header.
    if (next && section && section.getBoundingClientRect().top < header) {
      requestAnimationFrame(() => section.scrollIntoView?.({ block: "start" }));
    }
    setCollapsed(next);
  };

  const onPlusMouseDown = (index: number, event: MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey && selection) {
      setSelection({ anchor: selection.anchor, focus: index });
      return;
    }
    setSelection({ anchor: index, focus: index });
    setDragging(true);
    window.addEventListener("mouseup", () => setDragging(false), { once: true });
  };

  // Keyboard activation fires click without mousedown (detail === 0).
  const onPlusClick = (index: number, event: MouseEvent) => {
    if (event.detail !== 0) return;
    setSelection(
      event.shiftKey && selection
        ? { anchor: selection.anchor, focus: index }
        : { anchor: index, focus: index },
    );
  };

  const submitLineComment = (body: string) => {
    const start = lines[lo];
    const end = lines[hi];
    if (!start || !end) return;
    actions.addComment({
      path,
      range: { start: linePos(start), end: linePos(end) },
      snippet: lines.slice(lo, hi + 1).map(({ type, content }) => ({ type, content })),
      body,
    });
    setSelection(null);
  };

  const renderComments = (list: ReviewComment[], isOutdated = false) =>
    list.map((comment) => (
      <CommentCard
        key={comment.id}
        comment={comment}
        outdated={isOutdated}
        onUpdate={actions.updateComment}
        onDelete={actions.deleteComment}
      />
    ));

  const estimate = collapsed ? 48 : 56 + lines.length * 20 + file.hunks.length * 28;
  const displayPath = file.status === "renamed" ? `${file.oldPath} → ${file.newPath}` : path;

  return (
    <section
      ref={sectionRef}
      id={id}
      className={styles.file}
      hidden={hidden}
      aria-label={path}
      style={{ containIntrinsicSize: `auto ${estimate}px` }}
    >
      <header className={styles.header}>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={collapsed ? "Expand file" : "Collapse file"}
          aria-expanded={!collapsed}
          onClick={() => toggleCollapsed(!collapsed)}
        >
          {collapsed ? <ChevronRight /> : <ChevronDown />}
        </Button>
        <FileStatusBadge status={file.status} />
        <h2 className={styles.path} title={displayPath}>
          {displayPath}
        </h2>
        <span className={styles.stats}>
          <span className={styles.additions}>+{file.additions}</span>
          <span className={styles.deletions}>−{file.deletions}</span>
        </span>
        <span className={styles.headerActions}>
          <Button variant="ghost" size="xs" onClick={() => setFileDraft(true)}>
            <MessageSquare size={14} />
            Comment on file
          </Button>
          <label className={styles.viewed}>
            <Checkbox
              checked={viewed}
              onChange={(event) => {
                actions.setViewed(path, event.target.checked ? fingerprint : null);
                toggleCollapsed(event.target.checked);
              }}
            />
            Viewed
          </label>
        </span>
      </header>

      {!collapsed && (
        <div className={styles.body}>
          {(fileComments.length > 0 || outdated.length > 0 || fileDraft) && (
            <div className={styles.fileComments}>
              {renderComments(fileComments)}
              {renderComments(outdated, true)}
              {fileDraft && (
                <CommentForm
                  placeholder="Comment on this file"
                  onSubmit={(body) => {
                    actions.addComment({ path, range: null, snippet: [], body });
                    setFileDraft(false);
                  }}
                  onCancel={() => setFileDraft(false)}
                />
              )}
            </div>
          )}

          {file.binary ? (
            <p className={styles.notice}>Binary or very large file not shown.</p>
          ) : rows.length === 0 ? (
            <p className={styles.notice}>No content changes.</p>
          ) : (
            <table className={cx(styles.table, dragging && styles.dragging)}>
              <colgroup>
                <col className={styles.numCol} />
                <col className={styles.numCol} />
                <col />
              </colgroup>
              <tbody>
                {rows.map((row) => {
                  if (row.kind === "hunk") {
                    return (
                      <tr key={row.key} className={styles.hunk}>
                        <td colSpan={3}>{row.header}</td>
                      </tr>
                    );
                  }
                  const { line, index } = row;
                  const key = posKey(linePos(line));
                  const selected = index >= lo && index <= hi;
                  const lineComments = byEnd.get(key);
                  const tokens = highlighted
                    ? line.type === "del"
                      ? lineTokens(highlighted.old, line.oldNo, line.content)
                      : lineTokens(highlighted.new, line.newNo, line.content)
                    : null;
                  const label =
                    line.type === "del" ? `deleted line ${line.oldNo}` : `line ${line.newNo}`;
                  return [
                    <tr
                      key={key}
                      className={cx(styles.line, styles[line.type], selected && styles.selected)}
                      onMouseEnter={
                        dragging
                          ? () => setSelection((s) => (s ? { ...s, focus: index } : s))
                          : undefined
                      }
                    >
                      <td className={styles.num}>{line.oldNo}</td>
                      <td className={styles.num}>
                        <button
                          type="button"
                          className={styles.plus}
                          aria-label={`Comment on ${label}`}
                          onMouseDown={(event) => onPlusMouseDown(index, event)}
                          onClick={(event) => onPlusClick(index, event)}
                        >
                          <Plus size={12} strokeWidth={3} />
                        </button>
                        {line.newNo}
                      </td>
                      <td className={styles.code}>
                        <span className={styles.prefix}>{PREFIX[line.type]}</span>
                        {tokens ? <Tokens tokens={tokens} /> : line.content}
                      </td>
                    </tr>,
                    lineComments && (
                      <tr key={`${key}-comments`} className={styles.commentRow}>
                        <td colSpan={3}>
                          <div className={styles.stack}>{renderComments(lineComments)}</div>
                        </td>
                      </tr>
                    ),
                    selection && !dragging && index === hi && (
                      <tr key={`${key}-form`} className={styles.commentRow}>
                        <td colSpan={3}>
                          <div className={styles.stack}>
                            <CommentForm
                              onSubmit={submitLineComment}
                              onCancel={() => setSelection(null)}
                            />
                          </div>
                        </td>
                      </tr>
                    ),
                  ];
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
});

function Tokens({ tokens }: { tokens: Token[] }) {
  let offset = 0;
  return tokens.map((token) => {
    const start = offset;
    offset += token.content.length;
    return (
      <span key={start} className="shiki-token" style={token.style}>
        {token.content}
      </span>
    );
  });
}
