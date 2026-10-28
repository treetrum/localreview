import { memo, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { filePath, type DiffFile } from "../../../shared/types";
import { cx } from "../lib/cx";
import type { TreeNode } from "../lib/tree";
import { useLocalStorage } from "../lib/useLocalStorage";
import { FileStatusBadge } from "./FileStatusBadge";
import {
  ChevronDown,
  ChevronRight,
  CircleCheck,
  EyeOff,
  Folder,
  FolderOpen,
  List,
  ListTree,
  Search,
  X,
} from "./icons";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { ToggleGroup } from "./ui/ToggleGroup";
import styles from "./FileNav.module.css";

export const DEBOUNCE_MS = 150;

type FileView = "tree" | "list";
const isFileView = (value: unknown): value is FileView => value === "tree" || value === "list";

export type FileNavProps = {
  /** Visible (filtered) tree and files, in tree order. */
  tree: TreeNode[];
  files: DiffFile[];
  totalCount: number;
  query: string;
  onQueryChange: (query: string) => void;
  hideViewed: boolean;
  onHideViewedChange: (hideViewed: boolean) => void;
  fileId: ReadonlyMap<string, string>;
  viewed: ReadonlySet<string>;
  commentCounts: ReadonlyMap<string, number>;
};

export const FileNav = memo(function FileNav({
  tree,
  files,
  totalCount,
  query,
  onQueryChange,
  hideViewed,
  onHideViewedChange,
  fileId,
  viewed,
  commentCounts,
}: FileNavProps) {
  const [view, setView] = useLocalStorage<FileView>("localreview:fileView", "tree", isFileView);
  const row = (file: DiffFile, depth: number, showDir: boolean) => {
    const path = filePath(file);
    return (
      <FileRow
        key={path}
        file={file}
        href={`#${fileId.get(path) ?? ""}`}
        depth={depth}
        showDir={showDir}
        viewed={viewed.has(path)}
        comments={commentCounts.get(path) ?? 0}
      />
    );
  };

  return (
    <nav className={styles.nav} aria-label="Files">
      <div className={styles.toolbar}>
        <FileSearch
          query={query}
          onQueryChange={onQueryChange}
          matchCount={files.length}
          totalCount={totalCount}
        />
        <Button
          variant="outline"
          size="icon-sm"
          className={styles.hideViewed}
          aria-label="Hide viewed files"
          title="Hide viewed files"
          aria-pressed={hideViewed}
          onClick={() => onHideViewedChange(!hideViewed)}
        >
          <EyeOff />
        </Button>
        <ToggleGroup
          label="File view"
          value={view}
          onChange={setView}
          options={[
            { value: "tree", label: "Tree view", icon: <ListTree /> },
            { value: "list", label: "List view", icon: <List /> },
          ]}
        />
      </div>
      {files.length === 0 ? (
        <p className={styles.empty}>
          {totalCount === 0
            ? "No changed files"
            : `No ${query ? "matching " : ""}${hideViewed ? "unviewed " : ""}files`}
        </p>
      ) : view === "tree" ? (
        <Tree nodes={tree} renderFile={(file, depth) => row(file, depth, false)} />
      ) : (
        <ul className={styles.list}>{files.map((file) => row(file, 0, true))}</ul>
      )}
    </nav>
  );
});

type FileSearchProps = {
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  totalCount: number;
};

/** Owns the raw input text so keystrokes only re-render the input; reports a debounced query. */
export function FileSearch({ query, onQueryChange, matchCount, totalCount }: FileSearchProps) {
  const [text, setText] = useState(query);
  const [prevQuery, setPrevQuery] = useState(query);
  if (query !== prevQuery) {
    setPrevQuery(query);
    if (query === "" && text !== "") setText("");
  }

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const update = (next: string) => {
    setText(next);
    clearTimeout(timer.current);
    if (next.trim() === "") onQueryChange("");
    else timer.current = setTimeout(() => onQueryChange(next), DEBOUNCE_MS);
  };

  return (
    <div className={styles.search}>
      <Search className={styles.searchIcon} size={14} />
      <Input
        ref={inputRef}
        type="search"
        className={styles.searchInput}
        aria-label="Filter files"
        placeholder="Filter files…"
        value={text}
        onChange={(event) => update(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            update("");
          }
        }}
      />
      {text !== "" && (
        <>
          <span className={styles.matches} aria-live="polite">
            {matchCount}/{totalCount}
          </span>
          <button
            type="button"
            className={styles.clear}
            aria-label="Clear search"
            onClick={() => {
              update("");
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        </>
      )}
    </div>
  );
}

function Tree({
  nodes,
  renderFile,
}: {
  nodes: TreeNode[];
  renderFile: (file: DiffFile, depth: number) => ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (path: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(path)) next.add(path);
      return next;
    });

  const render = (list: TreeNode[], depth: number): ReactNode =>
    list.map((node) => {
      if (node.kind === "file") return renderFile(node.file, depth);
      const open = !collapsed.has(node.path);
      return (
        <li key={`dir:${node.path}`}>
          <button
            type="button"
            className={styles.dir}
            style={{ "--depth": depth } as CSSProperties}
            aria-expanded={open}
            onClick={() => toggle(node.path)}
            title={node.path}
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {open ? <FolderOpen size={14} /> : <Folder size={14} />}
            <span className={styles.name}>{node.name}</span>
          </button>
          {open && <ul>{render(node.children, depth + 1)}</ul>}
        </li>
      );
    });

  return <ul className={styles.tree}>{render(nodes, 0)}</ul>;
}

type FileRowProps = {
  file: DiffFile;
  href: string;
  depth: number;
  showDir: boolean;
  viewed: boolean;
  comments: number;
};

function FileRow({ file, href, depth, showDir, viewed, comments }: FileRowProps) {
  const path = filePath(file);
  const slash = path.lastIndexOf("/");
  const name = path.slice(slash + 1);
  const dir = slash === -1 ? "" : path.slice(0, slash);
  return (
    <li>
      <a
        href={href}
        className={cx(styles.file, viewed && styles.viewedFile, showDir && styles.listFile)}
        style={{ "--depth": depth } as CSSProperties}
        title={path}
      >
        <FileStatusBadge status={file.status} compact />
        <span className={styles.name}>{name}</span>
        {showDir && dir && <span className={styles.dirName}>{dir}</span>}
        <span className={styles.meta}>
          {comments > 0 && (
            <span
              className={styles.count}
              aria-label={`${comments} comment${comments === 1 ? "" : "s"}`}
            >
              {comments}
            </span>
          )}
          {viewed && (
            <span className={styles.tick} title="Viewed">
              <CircleCheck size={14} />
              <span className="visually-hidden">Viewed</span>
            </span>
          )}
        </span>
      </a>
    </li>
  );
}
