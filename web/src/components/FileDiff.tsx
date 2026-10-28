import { memo, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import type { DiffFile, DiffLine } from "../../../shared/types";
import { cx } from "../lib/cx";
import {
  buildRows,
  commentSpans,
  EXPAND_STEP,
  rowLines,
  type DiffRow,
  type Span,
} from "../lib/expand";
import { lineTokens, type Token } from "../lib/highlight";
import { linePos, posKey, type ReviewComment, type Side } from "../lib/review";
import { splitRows, type DiffView, type GapRow, type LineRow, type PairRow } from "../lib/rows";
import type { ReviewActions } from "../lib/useReview";
import { useCopy } from "../lib/useCopy";
import { useHighlightedFile } from "../lib/useHighlightedFile";
import { CommentCard, CommentForm } from "./Comment";
import { FileStatusBadge } from "./FileStatusBadge";
import {
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  ChevronUp,
  Copy,
  FoldVertical,
  MessageSquare,
  Plus,
  UnfoldVertical,
} from "./icons";
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
  view?: DiffView;
};

/** Selected lines, by `posKey`, so the selection survives rows being revealed above it. */
type Selection = { anchor: string; focus: string };

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
  view = "unified",
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
  const [pathCopied, copyPath] = useCopy();

  const [expanded, setExpanded] = useState<Span[]>([]);
  const rows = useMemo(
    () => buildRows(file, [...expanded, ...commentSpans(comments)]),
    [file, expanded, comments],
  );
  const split = view === "split";
  const displayRows: (DiffRow | PairRow)[] = useMemo(
    () => (split ? splitRows(rows) : rows),
    [rows, split],
  );
  const lines = useMemo(() => rowLines(rows), [rows]);
  const indexOf = useMemo(
    () => new Map(lines.map((line, index) => [posKey(linePos(line)), index])),
    [lines],
  );
  const expandable = rows.some((row) => row.kind === "gap" && (row.up || row.down));
  const reveal = (span: Span) => setExpanded((current) => [...current, span]);

  const { fileComments, outdated, byEnd } = useMemo(() => {
    const grouped = {
      fileComments: [] as ReviewComment[],
      outdated: [] as ReviewComment[],
      byEnd: new Map<string, ReviewComment[]>(),
    };
    for (const comment of comments.toSorted((a, b) => a.createdAt - b.createdAt)) {
      if (!comment.range) grouped.fileComments.push(comment);
      else if (!indexOf.has(posKey(comment.range.end))) grouped.outdated.push(comment);
      else {
        const key = posKey(comment.range.end);
        grouped.byEnd.set(key, [...(grouped.byEnd.get(key) ?? []), comment]);
      }
    }
    return grouped;
  }, [comments, indexOf]);

  const anchor = selection ? indexOf.get(selection.anchor) : undefined;
  const focus = selection ? indexOf.get(selection.focus) : undefined;
  const [lo, hi] =
    anchor !== undefined && focus !== undefined
      ? [Math.min(anchor, focus), Math.max(anchor, focus)]
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

  const onPlusMouseDown = (key: string, event: MouseEvent) => {
    if (event.button !== 0) return;
    event.preventDefault();
    if (event.shiftKey && selection) {
      setSelection({ anchor: selection.anchor, focus: key });
      return;
    }
    setSelection({ anchor: key, focus: key });
    setDragging(true);
    window.addEventListener("mouseup", () => setDragging(false), { once: true });
  };

  // Keyboard activation fires click without mousedown (detail === 0).
  const onPlusClick = (key: string, event: MouseEvent) => {
    if (event.detail !== 0) return;
    setSelection(
      event.shiftKey && selection
        ? { anchor: selection.anchor, focus: key }
        : { anchor: key, focus: key },
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

  const isSelected = (index: number) => index >= lo && index <= hi;
  const onLineEnter = (key: string) =>
    dragging ? () => setSelection((s) => (s ? { ...s, focus: key } : s)) : undefined;

  const plusButton = (line: DiffLine) => {
    const key = posKey(linePos(line));
    const label = line.type === "del" ? `deleted line ${line.oldNo}` : `line ${line.newNo}`;
    return (
      <button
        type="button"
        className={styles.plus}
        aria-label={`Comment on ${label}`}
        onMouseDown={(event) => onPlusMouseDown(key, event)}
        onClick={(event) => onPlusClick(key, event)}
      >
        <Plus size={12} strokeWidth={3} />
      </button>
    );
  };

  const code = (line: DiffLine, side: Side) => {
    const tokens = highlighted
      ? side === "old"
        ? lineTokens(highlighted.old, line.oldNo, line.content)
        : lineTokens(highlighted.new, line.newNo, line.content)
      : null;
    return (
      <>
        <span className={styles.prefix}>{PREFIX[line.type]}</span>
        {tokens ? <Tokens tokens={tokens} /> : line.content}
      </>
    );
  };

  /** Comments ending on this line, plus the comment form if the selection ends here. */
  const thread = ({ line, index }: LineRow) => {
    const lineComments = byEnd.get(posKey(linePos(line)));
    const form = selection && !dragging && index === hi;
    if (!lineComments && !form) return null;
    return (
      <div className={styles.stack}>
        {lineComments && renderComments(lineComments)}
        {form && <CommentForm onSubmit={submitLineComment} onCancel={() => setSelection(null)} />}
      </div>
    );
  };

  const unifiedLine = (row: LineRow) => {
    const { line, index, expanded: isExpanded } = row;
    const key = posKey(linePos(line));
    const lineThread = thread(row);
    return [
      <tr
        key={key}
        className={cx(
          styles.line,
          styles[line.type],
          isExpanded && styles.expanded,
          isSelected(index) && styles.selected,
        )}
        onMouseEnter={onLineEnter(key)}
      >
        <td className={styles.num}>{line.oldNo}</td>
        <td className={styles.num}>
          {plusButton(line)}
          {line.newNo}
        </td>
        <td className={styles.code}>{code(line, line.type === "del" ? "old" : "new")}</td>
      </tr>,
      lineThread && (
        <tr key={`${key}-thread`} className={styles.commentRow}>
          <td colSpan={3}>{lineThread}</td>
        </tr>
      ),
    ];
  };

  const half = (row: LineRow | null, side: Side) => {
    if (!row) {
      return [
        <td key={`${side}-num`} className={cx(styles.num, styles.empty)} />,
        <td key={`${side}-code`} className={styles.empty} />,
      ];
    }
    const { line, index, expanded: isExpanded } = row;
    const key = posKey(linePos(line));
    const cell = cx(
      styles[line.type],
      isExpanded && styles.expanded,
      isSelected(index) && styles.selected,
    );
    return [
      <td key={`${side}-num`} className={cx(styles.num, cell)} onMouseEnter={onLineEnter(key)}>
        {/* Context lines show on both sides but are commented on from the new side only. */}
        {linePos(line).side === side && plusButton(line)}
        {side === "old" ? line.oldNo : line.newNo}
      </td>,
      <td key={`${side}-code`} className={cx(styles.code, cell)} onMouseEnter={onLineEnter(key)}>
        {code(line, side)}
      </td>,
    ];
  };

  const splitPair = ({ key, left, right }: PairRow) => {
    const leftThread = left && left.line.type === "del" ? thread(left) : null;
    const rightThread = right && thread(right);
    return [
      <tr key={key} className={styles.pair}>
        {half(left, "old")}
        {half(right, "new")}
      </tr>,
      (leftThread || rightThread) && (
        <tr key={`${key}-thread`} className={styles.commentRow}>
          <td colSpan={2}>{leftThread}</td>
          <td colSpan={2}>{rightThread}</td>
        </tr>
      ),
    ];
  };

  const lineRows = displayRows.filter((row) => row.kind !== "gap").length;
  const estimate = collapsed ? 48 : 56 + lineRows * 20 + file.hunks.length * 28;
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
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={pathCopied ? "Copied file path" : "Copy file path"}
          title="Copy file path"
          onClick={() => void copyPath(path)}
        >
          {pathCopied ? <Check size={14} /> : <Copy size={14} />}
        </Button>
        <span className={styles.stats}>
          <span className={styles.additions}>+{file.additions}</span>
          <span className={styles.deletions}>−{file.deletions}</span>
        </span>
        <span className={styles.headerActions}>
          {!collapsed && (expandable || expanded.length > 0) && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={expandable ? "Expand all lines" : "Collapse expanded lines"}
              title={expandable ? "Expand all lines" : "Collapse expanded lines"}
              onClick={() =>
                setExpanded(expandable ? [{ start: 1, end: Number.MAX_SAFE_INTEGER }] : [])
              }
            >
              {expandable ? <UnfoldVertical size={14} /> : <FoldVertical size={14} />}
            </Button>
          )}
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
            <table className={cx(styles.table, split && styles.split, dragging && styles.dragging)}>
              <colgroup>
                {split ? (
                  <>
                    <col className={styles.numCol} />
                    <col />
                    <col className={styles.numCol} />
                    <col />
                  </>
                ) : (
                  <>
                    <col className={styles.numCol} />
                    <col className={styles.numCol} />
                    <col />
                  </>
                )}
              </colgroup>
              <tbody>
                {displayRows.map((row) =>
                  row.kind === "gap" ? (
                    <GapRowView key={row.key} row={row} split={split} onReveal={reveal} />
                  ) : row.kind === "pair" ? (
                    splitPair(row)
                  ) : (
                    unifiedLine(row)
                  ),
                )}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
});

function GapRowView({
  row,
  split,
  onReveal,
}: {
  row: GapRow;
  split: boolean;
  onReveal: (span: Span) => void;
}) {
  const { start, end } = row.hidden;
  const count = end - start + 1;
  const buttons: { label: string; icon: ReactNode; span: Span }[] = [];
  if ((row.up || row.down) && count <= EXPAND_STEP) {
    buttons.push({
      label: `Expand all ${count} hidden ${count === 1 ? "line" : "lines"}`,
      icon:
        row.up && row.down ? (
          <ChevronsUpDown size={14} />
        ) : row.up ? (
          <ChevronUp size={14} />
        ) : (
          <ChevronDown size={14} />
        ),
      span: row.hidden,
    });
  } else {
    if (row.down) {
      buttons.push({
        label: `Expand down ${EXPAND_STEP} lines`,
        icon: <ChevronDown size={14} />,
        span: { start, end: start + EXPAND_STEP - 1 },
      });
    }
    if (row.up) {
      buttons.push({
        label: `Expand up ${EXPAND_STEP} lines`,
        icon: <ChevronUp size={14} />,
        span: { start: end - EXPAND_STEP + 1, end },
      });
    }
  }
  return (
    <tr className={styles.hunk}>
      <td colSpan={split ? 1 : 2} className={styles.expandCell}>
        {buttons.map((button) => (
          <button
            key={button.label}
            type="button"
            className={styles.expand}
            aria-label={button.label}
            title={button.label}
            onClick={() => onReveal(button.span)}
          >
            {button.icon}
          </button>
        ))}
      </td>
      <td colSpan={split ? 3 : 1} className={styles.hunkHeader}>
        {row.header}
      </td>
    </tr>
  );
}

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
