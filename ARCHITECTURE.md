# localreview: Architecture & Design

This document covers what localreview is, how it's built, and why it's built that way. It's the
single reference for anyone (human or agent) picking up the codebase. For day-to-day conventions
see [`AGENTS.md`](AGENTS.md); for usage see [`README.md`](README.md).

---

## Contents

1. [Purpose](#1-purpose)
2. [Features](#2-features)
3. [System overview](#3-system-overview)
4. [Repository layout](#4-repository-layout)
5. [Server](#5-server)
6. [Shared types and API contract](#6-shared-types-and-api-contract)
7. [Web UI](#7-web-ui)
8. [Review model and persistence](#8-review-model-and-persistence)
9. [Copied review format](#9-copied-review-format)
10. [Syntax highlighting](#10-syntax-highlighting)
11. [Styling system](#11-styling-system)
12. [Performance](#12-performance)
13. [Testing strategy](#13-testing-strategy)
14. [Tooling and workflow](#14-tooling-and-workflow)
15. [Decision log](#15-decision-log)
16. [Known limitations and future work](#16-known-limitations-and-future-work)
17. [History](#17-history)

---

## 1. Purpose

localreview is a small command-line tool that starts a local web server for reviewing a git diff
in the browser. You leave comments on lines, line ranges, whole files, or the change overall, then
copy them as one Markdown document to paste into an AI coding agent, which responds and fixes the
feedback.

It's functionally similar to [difit](https://github.com/yoshiko-pg/difit). The main reason to build
our own is **full control over styling and UX**, with a deliberately small feature set to start.

Typical loop:

```
agent makes changes ──► localreview ──► review in browser ──► Copy review
        ▲                                                         │
        └──────────── paste Markdown into the agent ◄─────────────┘
```

After the agent edits files, hit refresh. The diff reloads, comments persist, and any file whose
diff changed is automatically un-marked as viewed.

---

## 2. Features

| Area                          | Behaviour                                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Diff targets**              | Default: current branch (committed + uncommitted + untracked) vs its merge-base with `main`/`master`. Also: any base ref, `--staged`, `--commit <sha>`.                   |
| **Diff view**                 | Unified diff per file, with hunk headers, old/new line numbers, wrapped lines, sticky file headers and syntax highlighting (light and dark).                              |
| **Expand context**            | Hunk headers carry GitHub-style expand buttons: 20 lines up or down, or all of a gap of 20 or fewer. **Expand all lines** in the file header shows the whole file.        |
| **Line comments**             | Hover a line and click **+**. Drag across rows, or shift-click a second **+**, for a range. Comments on deleted lines are anchored to the old side.                       |
| **File and overall comments** | **Comment on file** per file; an **Overall feedback** box for the whole change.                                                                                           |
| **Editing**                   | Edit and delete comments. ⌘/Ctrl+↵ submits, Esc cancels.                                                                                                                  |
| **Outdated comments**         | If a commented line disappears after a refresh, the comment moves to the top of the file with an _Outdated_ badge. It's still included when copying.                      |
| **Copy review**               | Formats all feedback as Markdown (with `diff` snippets) and copies it to the clipboard.                                                                                   |
| **Copy file path**            | An icon button beside each file's path copies it (the new path for renames) to the clipboard.                                                                             |
| **Persistence**               | Comments, summary and viewed state are saved in `localStorage` per repo and diff target. **Clear** removes feedback but keeps viewed state.                               |
| **Viewed tracking**           | A per-file **Viewed** checkbox collapses the file. A progress bar in the header shows _x/y viewed_. Viewed marks reset automatically when a file's diff changes.          |
| **File navigation**           | Sidebar with **tree** view (collapsible folders, single-child chains compressed like `src/components`) or **list** view (filename + directory). The choice is remembered. |
| **Filter**                    | Path search (case-insensitive; space-separated terms must all match) that narrows both the sidebar and the diff. Debounced; `/` focuses it, Esc clears it.                |
| **Refresh**                   | Reloads the diff from git without restarting.                                                                                                                             |

---

## 3. System overview

```
┌──────────────────────────────── localreview (Bun process) ───────────────────────────────┐
│                                                                                           │
│  src/cli.ts ── parse args ──► src/server.ts (Bun.serve on 127.0.0.1)                      │
│                                  │                                                        │
│                                  ├── GET /api/diff ──► src/git.ts ──► git CLI              │
│                                  │                        │                               │
│                                  │                        └─► src/parse-diff.ts           │
│                                  │                                                        │
│                                  └── GET /* ──► dist/ (Vite build of web/), SPA fallback  │
└───────────────────────────────────────────────────────────────────────────────────────────┘
                     ▲  JSON (shared/types.ts: DiffResponse)
                     │
┌────────────────────┴──────────── Browser (React 19 SPA) ─────────────────────────────────┐
│  App ─► useDiff (fetch) ─► Review                                                         │
│                              ├── header: progress, refresh, Clear, Copy review            │
│                              ├── FileNav: filter, tree/list                               │
│                              └── FileDiff × N: lines, selection, comments, Viewed         │
│  State: useReview ⇄ localStorage     Highlighting: Shiki (lazy, per file)                 │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

Key properties:

- **The server is stateless.** It only turns git output into JSON and serves static files. All
  review state lives in the browser.
- **The diff is recomputed on every `/api/diff` request**, so refresh always reflects the current
  working tree.
- **One process, one port in production.** In development, Vite serves the UI with HMR and
  proxies `/api` to the Bun server.

---

## 4. Repository layout

```
localreview/
├── src/                      # Bun: CLI + API server (Bun-only APIs; tested with bun test)
│   ├── cli.ts                # entry point / bin; arg parsing, start server, open browser
│   ├── server.ts             # Bun.serve: /api/diff + static dist/ with SPA fallback
│   ├── git.ts                # diff targets, git invocations, file contents, untracked files
│   ├── parse-diff.ts         # unified diff parser (pure; also used by UI test fixtures)
│   ├── test-repo.ts          # throwaway git repos for the server tests
│   └── *.test.ts
├── shared/
│   └── types.ts              # DiffResponse / DiffFile / DiffHunk / DiffLine, filePath()
├── web/                      # Vite root
│   ├── index.html
│   └── src/
│       ├── main.tsx          # fonts, global CSS, React root
│       ├── App.tsx           # load states + Review (top-level state, layout)
│       ├── App.test.tsx      # cross-component flows only
│       ├── components/
│       │   ├── FileDiff.tsx  # one file: header, comments, diff table, selection, viewed
│       │   ├── FileNav.tsx   # sidebar: filter input, tree/list views
│       │   ├── Comment.tsx   # CommentForm + CommentCard
│       │   ├── FileStatusBadge.tsx
│       │   ├── icons.tsx     # inlined Lucide icons
│       │   ├── ui/           # shadcn-style primitives: Button, Badge, Checkbox, Input,
│       │   │                 #   Progress, Textarea, ToggleGroup
│       │   └── *.test.tsx    # component tests, next to each component
│       ├── lib/
│       │   ├── review.ts     # review types, line positions, fingerprints, range labels
│       │   ├── expand.ts     # diff rows: hunks merged with revealed context lines
│       │   ├── format.ts     # Markdown output
│       │   ├── tree.ts       # file tree building, ordering and filtering
│       │   ├── filter.ts     # path matching
│       │   ├── highlight.ts  # Shiki setup, language detection, serial queue
│       │   ├── useDiff.ts, useReview.ts, useHighlightedFile.ts, useLocalStorage.ts
│       │   └── *.test.ts
│       ├── styles/global.css # design tokens, reset, Shiki token colours
│       └── test/             # Vitest setup, fixtures, renderApp()
├── e2e/                      # Playwright: fixtures.ts + review.e2e.ts
├── scripts/dev.ts            # runs the API (watch mode) and Vite together
├── .githooks/                # pre-commit (bun run check), commit-msg (Conventional Commits)
├── .github/workflows/        # ci.yml (checks + E2E), pr-title.yml (Conventional Commit titles)
├── vite.config.ts            # Vite + Vitest config
├── playwright.config.ts
├── .oxlintrc.json, .oxfmtrc.json, tsconfig.json
├── AGENTS.md, README.md, ARCHITECTURE.md
└── package.json
```

The split is **by runtime**: `src/` runs on Bun (it uses `Bun.spawn`, `Bun.file`, `Bun.serve`);
`web/` runs in the browser (and in Node/happy-dom under Vitest); `shared/` is plain types used by
both. `e2e/` runs under Node (Playwright's runner), so it uses `node:child_process` rather than Bun
APIs.

---

## 5. Server

### 5.1 CLI (`src/cli.ts`)

```
localreview [base-ref] [options]

  base-ref              Compare against this ref instead of main/master
  --staged              Review staged changes only
  --commit <sha>        Review a single commit
  -C, --cwd <dir>       Run as if started in <dir>
  -p, --port <port>     Port to listen on (default: 4180)
  --no-open             Don't open the browser
  -h, --help
```

- Argument parsing uses `node:util` `parseArgs`. There's no CLI framework dependency.
- `base-ref`, `--staged` and `--commit` are mutually exclusive.
- It verifies the directory is a git repo before starting, then loads the diff once so a bad ref
  fails in the terminal rather than in the browser.
- It warns if `dist/` hasn't been built.
- It opens the browser with `open` / `xdg-open` / `start` depending on platform.
- `package.json#bin` points straight at `src/cli.ts` (with a `#!/usr/bin/env bun` shebang), so
  `bun link` gives a global `localreview` that runs from source.

### 5.2 Diff targets (`src/git.ts`)

| Target            | Base                                                                                    | Compared against   | Untracked included | Label                       |
| ----------------- | --------------------------------------------------------------------------------------- | ------------------ | ------------------ | --------------------------- |
| default / `<ref>` | `git merge-base <ref> HEAD` (ref defaults to `main`, then `master`, then `origin/HEAD`) | **working tree**   | yes                | `feature vs main`           |
| `--staged`        | `HEAD` (empty tree if no commits)                                                       | index (`--cached`) | no                 | `Staged changes on feature` |
| `--commit <sha>`  | `<sha>^` (empty tree for root commits)                                                  | `<sha>`            | no                 | `abc1234 <subject>`         |

The default diffs the merge-base against the working tree rather than `HEAD`, so uncommitted
work-in-progress is part of the review. That matches the workflow of reviewing what an agent has
just done.

### 5.3 Pipeline

1. **Resolve** the repo root (`rev-parse --show-toplevel`), current branch, base SHA and label.
2. **Diff:** `git -c core.quotePath=false diff --no-color --no-ext-diff --no-relative
   --src-prefix=a/ --dst-prefix=b/ -M <args>`.
   - `core.quotePath=false` keeps non-ASCII paths readable.
   - `--no-ext-diff` ignores user diff tools.
   - `--no-relative` and the explicit prefixes override user config (`diff.relative`,
     `diff.mnemonicPrefix`, `diff.noprefix`) that would change the output the parser expects.
   - `-M` detects renames.
3. **Parse** with `parseDiff` (see 5.4).
4. **Load full file contents** for highlighting, in parallel (at most 16 at a time):
   - Old side: `git show <base>:<path>`.
   - New side: depends on the target (working-tree file / `:path` from the index / `<sha>:path`).
   - Files over **512 KB** are skipped (no highlighting), checked with `cat-file -s` or the file's
     size.
5. **Untracked files** (branch target only): `git ls-files --others --exclude-standard -z`. Each
   one becomes an all-additions file via `addedFile()`. Binary (NUL byte in the first 8 KB) or
   oversized files are shown as "binary or very large".
6. **Sort** by path in plain code-unit order. The UI re-orders by tree (see 7.3); this just makes
   the API output deterministic.

All git calls go through one `git()` helper. It spawns with piped stdout/stderr and throws
`GitError` with git's stderr on failure. `tryGit()` returns `null` instead of throwing, for probes.

### 5.4 Unified diff parser (`src/parse-diff.ts`)

A small, dependency-free state machine over the `git diff` output:

- `diff --git a/X b/Y` starts a file. Paths can contain spaces, so the header is split on the
  assumption that both halves are identical: for a non-rename, `"a/P b/P"` has length
  `2·(len(P)+2)+1`. Renames are then corrected from the `rename from` / `rename to` lines.
- Inside a hunk, the line prefix decides the type: `+` add, `-` del, space context, `\` (no
  newline marker) ignored. **Prefixes are checked before header patterns**, so content like
  `--- a/old` inside a hunk is treated as a deleted line `-- a/old`, not a file header.
- Hunk headers (`@@ -a,b +c,d @@`) set the old/new line counters. Each line gets `oldNo` and/or
  `newNo`.
- `new file mode` / `deleted file mode` / `rename from` / `Binary files … differ` set
  `status` / `binary`.

`addedFile(path, content, status)` builds a synthetic all-additions file, handling a trailing
newline (no phantom final line) and empty files (no hunks).

### 5.5 HTTP server (`src/server.ts`)

- `Bun.serve` on **127.0.0.1** only. It's a local tool, so it shouldn't be reachable from the
  network.
- `GET /api/diff` returns a `DiffResponse` as JSON, or `{ error }` with status 500 (the `GitError`
  message is shown to the user). Other `/api/*` paths are 404.
- Every other path serves files from `dist/`, falling back to `index.html`. Paths are normalised
  as absolute paths, which collapses `..` segments and keeps lookups inside `dist/`. If `dist/`
  hasn't been built, it answers 503 with instructions.
- **Port selection:** an explicit `--port` is strict. Otherwise it starts at 4180 and tries up to
  20 following ports on `EADDRINUSE`. `--port 0` lets the OS pick, which the E2E tests use.

---

## 6. Shared types and API contract

`shared/types.ts`:

```ts
type FileStatus = "added" | "deleted" | "modified" | "renamed" | "untracked";
type DiffLine = {
  type: "add" | "del" | "context";
  oldNo: number | null;
  newNo: number | null;
  content: string;
};
type DiffHunk = { header: string; oldStart: number; newStart: number; lines: DiffLine[] };
type DiffFile = {
  oldPath: string;
  newPath: string;
  status: FileStatus;
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
  oldContent?: string;
  newContent?: string; // full contents for highlighting; omitted if binary/huge
};
type DiffResponse = {
  repoName: string;
  repoRoot: string;
  branch: string | null;
  label: string; // e.g. "feature vs main"
  baseRef: string;
  baseSha: string;
  files: DiffFile[];
};
```

A file's identity in the UI is `filePath(file)`, which is `oldPath` for deleted files and
`newPath` otherwise.

---

## 7. Web UI

### 7.1 Component structure

```
App                              load states (loading / error + Try again / ready)
└── Review  key=storageKey       owns review state, filter query, derived data
    ├── header                   repo / label / base SHA, progress, refresh, Clear, Copy review
    ├── FileNav                  sidebar
    │   ├── FileSearch           owns raw input text + debounce timer
    │   ├── ToggleGroup          tree ⇄ list (persisted)
    │   └── Tree / list → FileRow
    └── main
        ├── Overall feedback (Textarea)
        └── FileDiff × N  (memo)  header (collapse, status, path, copy path, stats, expand all, Comment on file, Viewed)
                                  file / outdated comments, file draft
                                  table: gap rows (expand buttons, hunk header), line rows (+ button), comment rows / form
```

`Review` is keyed by its storage key, so switching to a different repo or target remounts it with
fresh state. That avoids writing one review's state under another's key.

If a refresh fails while a diff is already loaded, the review stays on screen with an error banner
rather than being replaced by the error page, so unsaved drafts survive.

### 7.2 State ownership

| State                                            | Owner                           | Persisted                                        |
| ------------------------------------------------ | ------------------------------- | ------------------------------------------------ |
| Diff data, loading/error/refreshing              | `useDiff` (in `App`)            | no (refetched)                                   |
| Comments, summary, viewed marks                  | `useReview` (in `Review`)       | `localStorage["localreview:<repoRoot>:<label>"]` |
| Applied filter query                             | `Review`                        | no                                               |
| Raw filter input text, debounce timer            | `FileSearch`                    | no                                               |
| Tree vs list view                                | `FileNav` via `useLocalStorage` | `localStorage["localreview:fileView"]`           |
| Collapsed folders                                | `Tree`                          | no                                               |
| Collapsed file, line selection, drag, file draft | `FileDiff`                      | no                                               |
| Revealed context lines                           | `FileDiff`                      | no (lines with comments are always revealed)     |
| Copied flash (2 s)                               | `Review`                        | no                                               |

Derived in `Review` (memoised): the tree, files in tree order, visible files/tree/paths for the
filter, `fileId` (path → `file-<index>`), fingerprints, comments grouped by path, comment counts,
and the viewed paths. Comment groups reuse the previous array for paths whose comments didn't
change, so a new comment only re-renders the file it belongs to.

`useDiff` keeps the in-flight request promise in state; `refresh()` replaces it and an effect
subscribes to the current one, ignoring responses from superseded requests.

### 7.3 File ordering and tree

`buildTree(files)` groups by directory, then sorts **directories first, then files**, each
case-insensitively with natural numeric ordering (`step2` before `step10`). Chains of
single-child directories are compressed (`web/src`). `treeOrder(tree)` flattens it back.

**The diff list uses tree order**, so the main view always matches the sidebar, and the copied
review lists files in the same order too.

Tree indentation is a CSS variable (`--indent: 0.625rem` per level). Files are offset to line up
with sibling folder icons rather than chevrons.

### 7.4 Line selection and comments (`FileDiff`)

- Each line row has a **+** button in the new-line-number gutter (visible on hover/focus).
- **Click:** selects that line. **Shift-click:** extends the current selection. **Drag:**
  mousedown on **+**, `mouseenter` on later rows extends the selection, and a one-off
  `window` `mouseup` listener (attached in the mousedown handler) ends the drag, so releasing
  anywhere works. Keyboard activation (Enter/Space on a focused **+**) selects the line too.
- Selection is stored as the `posKey`s of its two ends (`anchor`/`focus`) and resolved to
  indices into the file's displayed lines, so a range can span hunks and both sides, and an
  open comment form stays on its line when lines are revealed above it.
- The comment form renders **after the last selected row** once dragging ends. Submitting calls
  `actions.addComment` with:
  - `range`: start/end as `LinePos` (`{ side, line }`). Deleted lines use `{ side: "old", line:
    oldNo }`; everything else uses `{ side: "new", line: newNo }`.
  - `snippet`: the selected lines' `{ type, content }`, captured at comment time.
- Existing comments render in a row directly below the line their range **ends** on (looked up by
  `posKey(range.end)`). Comments whose end line no longer exists are shown as _Outdated_ (with
  their captured snippet) at the top of the file.

### 7.5 Expanding context (`lib/expand.ts`)

- No extra API: the gaps around hunks are filled from `newContent`, which the server already
  sends for highlighting. Gap lines are unchanged, so their old line number is the new one
  shifted by the net deletions of the hunks above. Highlighting works as for any other line.
- `buildRows(file, revealed)` merges hunks with revealed spans of new-side line numbers. Each
  hidden run becomes a gap row with `up`/`down` flags; the hunk header stays on the gap row
  next to its hunk and disappears once that gap is fully revealed.
- Expansion is disabled (headers only) when there's no `newContent` (binary, over 512 KB,
  deleted) or when it doesn't match the diff's lines (the file changed since the diff).
- Revealed spans are local `FileDiff` state and aren't persisted. **Lines with comments are
  always revealed** (`commentSpans`), so a comment on an expanded line survives a reload and
  is only outdated if its line is gone from the file. `formatReview` uses the same rows, so the
  copied review agrees.
- Expanded lines get a muted gutter. Below 760 px the file header's actions wrap onto their own
  row so the path stays visible.

### 7.6 Viewed and collapse

- `Viewed` calls `actions.setViewed(path, fingerprint | null)`.
- A file is viewed if `review.viewed[path] === fileFingerprint(currentFile)`. The fingerprint is
  a fast string hash (FNV-1a) over status, paths, hunk headers and every line's type and content.
  If the agent changes a file, its fingerprint changes and it shows as unviewed again without any
  bookkeeping.
- `FileDiff` keeps its own `collapsed` state, initialised from `viewed` and **re-synced when
  `viewed` changes** (React's "adjust state when a prop changes" pattern, without an effect). That
  lets the user still expand a viewed file manually.
- When collapsing a file whose top has scrolled above the viewport, the view scrolls back to its
  header so you don't lose your place.

### 7.7 Filter

- `matchesQuery(path, query)`: lowercase; split on whitespace; every term must be a substring.
- **Debouncing lives in `FileSearch`.** It owns the input text, so a keystroke only re-renders
  the input. It calls `onQueryChange` 150 ms after typing stops. Clearing (empty text, Esc, or ✕)
  reports `""` immediately.
- If the parent clears the query (the **Clear filter** button in the empty diff), `FileSearch`
  resets its text through the same "adjust state on prop change" pattern.
- Filtered-out `FileDiff`s are **hidden (`hidden` attribute), not unmounted**, so unsaved drafts,
  selections and collapse state survive.
- `/` focuses the filter unless focus is already in an input, textarea or contenteditable.

### 7.8 Accessibility notes

- Controls are real `button`/`a`/`input`/`label` elements with accessible names (e.g. "Comment on
  line 8", "Comment on deleted line 6", "Edit comment", "Viewed", "Filter files", "Expand up 20
  lines", "Expand all 10 hidden lines", "Expand all lines").
- Each file is a labelled `section` (a region named by its path).
- The progress bar is a native `<progress>`. The view toggle is a `<fieldset>` of `aria-pressed`
  buttons. Folders use `aria-expanded`.
- The tests query by role and label, which keeps these names honest.

---

## 8. Review model and persistence

```ts
type LinePos = { side: "old" | "new"; line: number };
type ReviewComment = {
  id: string; // crypto.randomUUID()
  path: string;
  range: { start: LinePos; end: LinePos } | null; // null = file-level comment
  snippet: { type: "add" | "del" | "context"; content: string }[];
  body: string;
  createdAt: number;
};
type ReviewState = { summary: string; comments: ReviewComment[]; viewed: Record<string, string> };
```

`useReview(storageKey)`:

- Reads `localStorage` once on mount and merges it over the empty state, field by field. That
  handles reviews saved by older versions (e.g. without `viewed`); corrupt JSON or wrongly typed
  fields fall back to empty.
- Writes the whole state back on every change.
- Returns `{ review, actions }`. `actions` is memoised with stable identity, which matters for
  `FileDiff` memoisation.
- `clear()` resets summary and comments but **keeps `viewed`**: clearing feedback after pasting it
  into an agent isn't the same as forgetting what you've reviewed.

**Why the browser holds state:** the server stays trivial and stateless, refreshes and restarts
don't lose work, and there's no file to clean up in the user's repo. The storage key includes the
repo root and target label, so different repos and targets don't collide.

---

## 9. Copied review format

`formatReview({ label, files, summary, comments })` in `web/src/lib/format.ts`:

````md
# Code review: feature vs main

Please address the following review feedback. Line numbers refer to the new version of each file unless marked as deleted.

## Overall

Nice work.

## `src/server.ts`

File-level comment first.

### Line 6 (deleted)

```diff
-    fetch(req) {
```

Why make this async?

### Lines 6–8

```diff
+    async fetch(req) {
+      const url = new URL(req.url);
+      if (url.pathname === "/health") return new Response("ok");
```

Extract the routing.
````

Rules:

- **Files** appear in tree order. Comments on files no longer in the diff are kept, appended at the
  end in sorted order.
- **Within a file:** file-level comments first, then outdated comments (as in the UI), then line
  comments ordered by their end line's position in the diff; ties are broken by creation time.
- **Range labels:** `Line N`, `Lines A–B`, plus `(deleted)` for the old side, or
  `Lines old A–new B` when a range spans sides. Outdated comments get an `(outdated)` suffix.
- **Snippets** use a `diff` fence with `+`/`-`/space prefixes, so the agent sees what changed. The
  fence grows longer than any backtick run inside the snippet so it can't close early.
- **Blank comments** are skipped. **Copy review** is disabled unless there's real feedback.

---

## 10. Syntax highlighting

- **Engine:** Shiki **core** with the **JavaScript regex engine** (`forgiving: true`), so no
  Oniguruma WASM, plus the `github-light` and `github-dark` themes.
- **Languages** are detected from the filename: a few special names (`Dockerfile`, `Makefile`,
  `.env*`, …), an alias map (`mjs`→`javascript`, `h`→`c`, …), then Shiki's bundled IDs and aliases.
  Grammars are **dynamically imported on first use**, so Vite code-splits each into its own chunk.
- **Whole-file highlighting:** the old and new contents are highlighted in full, and tokens are
  looked up by line number (`tokens[oldNo-1]` for deleted lines, `tokens[newNo-1]` otherwise).
  Highlighting only the hunk lines would break multi-line strings and comments.
- **Lazy:** `useHighlightedFile` starts highlighting once the file is within 1000 px of the
  viewport (`IntersectionObserver`).
- **Serial queue:** highlighting is synchronous CPU work, so jobs run one at a time and yield to
  the event loop between files.
- **Safety check:** tokens are only used if their joined text equals the diff line's content (CR
  stripped). If the file changed between the diff and the read, it falls back to plain text.
- **Dual theme:** tokens are rendered with `defaultColor: false`, so each token carries both
  `--shiki-light` and `--shiki-dark`. `.shiki-token` picks one based on `prefers-color-scheme`.

---

## 11. Styling system

- **CSS Modules only.** There are no Tailwind, shadcn, Radix or icon packages; the shadcn **look**
  is reproduced by hand.
- **`web/src/styles/global.css`** holds:
  - shadcn's **zinc** design tokens in `oklch` (`--background`, `--foreground`, `--muted`,
    `--border`, `--ring`, `--radius`, …) with a `prefers-color-scheme: dark` override;
  - diff colours (`--diff-add`, `--diff-del`, `--diff-rename`, translucent backgrounds via
    `color-mix`) and layout variables (`--header-height`, `--sidebar-width`);
  - a minimal reset and the Shiki token rules.
- **Primitives** in `components/ui/` mirror shadcn's API and visuals: `Button` (variants
  `default | outline | secondary | ghost | destructive`, sizes `default | sm | xs | icon |
  icon-sm | icon-xs`), `Badge`, `Checkbox` (styled native input), `Input`, `Progress` (styled
  native `<progress>`), `Textarea` (auto-growing via `field-sizing: content`), `ToggleGroup`.
- **Icons** are Lucide SVG paths inlined in `components/icons.tsx` (ISC licence).
- **Fonts:** Geist Sans and Geist Mono via `@fontsource-variable`.
- **Layout:** a CSS grid with a sticky app header, a sticky scrollable sidebar and a main column.
  File headers are sticky beneath the app header. File cards use `overflow: clip` (not `hidden`)
  so rounded corners clip their content without breaking `position: sticky`. Below 760 px the
  sidebar is hidden.
- **Specificity gotcha:** a module class that overrides a primitive's styles can lose to it
  depending on stylesheet order. Where that happens, the selector is doubled up (e.g.
  `.search .searchInput`) rather than relying on load order.

---

## 12. Performance

Large diffs (thousands of lines, dozens of files) make typing in the filter laggy if every
keystroke re-renders or restyles the whole page. The design avoids that:

| Problem                                                                      | Fix                                                                                                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Every keystroke re-rendering every `FileDiff`                                | Raw input text lives in `FileSearch`; only the debounced query is lifted up                                                                   |
| Unrelated state changes re-rendering every file                              | `FileDiff` is `memo`'d; `actions` has stable identity; `fingerprint` passed as a prop (no inline callbacks); a shared empty-comments constant |
| The browser restyling all files' DOM on any input change, even a plain input | `content-visibility: auto` on each file section, with `contain-intrinsic-size: auto <estimate>px` from line/hunk counts                       |
| Highlighting being expensive                                                 | Lazy per file (near-viewport) + serial queue that yields                                                                                      |

The size estimate keeps the scrollbar stable before files have rendered. Anchor jumps from the
sidebar land correctly with `content-visibility` (covered by an E2E test).

---

## 13. Testing strategy

Three layers. Pick the cheapest layer that can catch the bug.

| Layer               | Location              | Runner                                            | Scope                                                                                                                 | In pre-commit           |
| ------------------- | --------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| Server              | `src/**/*.test.ts`    | `bun test ./src`                                  | parser; `loadDiff` against **real temp git repos** (branch, staged, commit, root commit, renames, deletes, untracked) | ✅                      |
| UI unit + component | `web/**/*.test.ts(x)` | Vitest + happy-dom + Testing Library + user-event | pure logic; each component in isolation; `useReview` via `renderHook`; cross-component flows in `App.test.tsx`        | ✅                      |
| End-to-end          | `e2e/*.e2e.ts`        | Playwright (Chromium)                             | only what needs a real browser + server                                                                               | ❌ (`bun run test:e2e`) |

All three layers run in CI on every pull request.

### 13.1 Why the UI isn't tested with `bun test`

Vitest shares `vite.config.ts`, so CSS Modules and the React plugin behave exactly as in the app.
`src/` stays on `bun test` because it uses Bun-only APIs. Running two unit runners split by
runtime is cleaner than forcing either one onto the other.

### 13.2 Component tests

- **Each component is tested on its own, next to its file:**
  - `Comment.test.tsx`: submit and cancel keys, blank comments, edit and delete.
  - `FileDiff.test.tsx`: the exact `addComment` payloads for deleted lines, shift-click ranges,
    ranges spanning both sides, drags and keyboard activation; comment placement; outdated
    comments; expanding gaps, comments on revealed lines and expand/collapse all; the fingerprint passed to `setViewed`; collapse following `viewed`; binary files.
  - `FileNav.test.tsx`: tree and list views, the debounced `onQueryChange` (fake timers), Esc and
    ✕ clearing, the parent clearing the query, the `/` shortcut, match counts.
  - `useReview.test.ts`: persistence, per-key isolation, edit and delete, Clear semantics,
    migration of older and corrupt saved data, stable actions.
- **Conventions:** a `defaultProps` object with `vi.fn()` callbacks; assert the exact data
  passed to callbacks; vary mock data with object spread.
- **`App.test.tsx`** renders `<App />` via `renderApp()`, which stubs only `fetch`. It covers only
  behaviour that spans components:
  - load error + retry; the empty diff;
  - viewed driving the progress bar and sidebar tick;
  - refresh un-marking only changed files;
  - filtering keeping unsaved drafts, and the main-area **Clear filter** button;
  - copy combining all comments; sidebar comment counts;
  - Clear confirm and cancel.
- **Fixtures** (`web/src/test/fixtures.ts`): the demo diff is a **readable unified diff string
  parsed with the real `parseDiff`**, plus an untracked file from `addedFile`, not a hand-written
  JSON blob. `mockComment` is the base comment.
- **Setup:** after each test, `cleanup()`, clear `localStorage`, restore real timers (so a
  timed-out fake-timer test can't leak fake timers into later tests) and unstub globals. Mocks are
  cleared between tests. happy-dom provides `IntersectionObserver` (it never fires, so no
  highlighting runs) and user-event provides an in-memory clipboard; `confirm` is stubbed per test.

### 13.3 End-to-end tests

`e2e/review.e2e.ts` covers:

1. Committed + uncommitted + untracked changes are listed against `main` (real git through the real
   server).
2. Drag-select with a real mouse plus a deleted-line comment, then the **exact** Markdown read
   back from the real clipboard.
3. Clicking a sidebar link scrolls the file into the viewport (real layout).
4. Comments and viewed state survive a full page reload.
5. Editing a file on disk, then refreshing, un-marks it as viewed.
6. Expanding a gap from real file contents, commenting on a revealed line, and that comment
   surviving a reload and copying without an _Outdated_ label.

Fixtures (`e2e/fixtures.ts`):

- **Per worker:** one temp git repo and one `localreview` server (`--port 0`, URL parsed from
  stdout).
- **Per test:** the `repo` fixture resets the working tree after the test (hard reset, clean,
  re-apply the fixture's uncommitted and untracked changes). Each test gets a fresh browser
  context, so `localStorage` starts empty.
- The browser is granted clipboard permissions in `playwright.config.ts`.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can point at a preinstalled Chromium; CI installs Playwright's
  own with `bunx playwright install --with-deps chromium`.

---

## 14. Tooling and workflow

| Tool                      | Choice                            | Notes                                                                                                                                              |
| ------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime / package manager | **Bun**                           | CLI, server, scripts, `bun test`, `bun link`; version pinned via `packageManager`                                                                  |
| Frontend build            | **Vite**                          | `root: web`, output `dist/`, `/api` proxy in dev; large-chunk warning raised because grammars are lazy                                             |
| UI                        | **React 19** + TypeScript         |                                                                                                                                                    |
| Type checking             | **TypeScript 7** (`tsc --noEmit`) | `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `moduleResolution: bundler`                                                          |
| Lint                      | **oxlint**                        | plugins: typescript, unicorn, oxc, import, react, jsx-a11y; `correctness` + `suspicious` as errors, `perf` as warnings; run with `--deny-warnings` |
| Format                    | **oxfmt**                         | `printWidth: 100`                                                                                                                                  |
| Tests                     | bun test, Vitest, Playwright      | see section 13                                                                                                                                     |
| CI                        | **GitHub Actions**                | see 14.1                                                                                                                                           |

**Scripts:**

```sh
bun run dev        # LOCALREVIEW_REPO=<repo>: Bun API on :4173 (--watch) + Vite on :5173 (HMR, proxies /api)
bun run build      # vite build → dist/
bun run check      # format:check + lint + typecheck + test:server + test:web  (pre-commit)
bun run test:e2e   # vite build + playwright test
bun run format     # oxfmt (write)
```

**Lint exceptions and options** (configured in `.oxlintrc.json`, never inline):

| Rule                                                                    | Where      | Why                                                                         |
| ----------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------- |
| `jsx-a11y/no-autofocus`                                                 | everywhere | Comment forms open from an explicit user action and should take focus.      |
| `react/react-in-jsx-scope`                                              | everywhere | The automatic JSX runtime (`jsx: react-jsx`) doesn't need `React` in scope. |
| `import/no-unassigned-import` (allow)                                   | everywhere | CSS, font and jest-dom imports are side-effect-only by design.              |
| `jsx-a11y/label-has-associated-control` (`controlComponents: Checkbox`) | everywhere | `Checkbox` renders a native input inside its label.                         |
| `no-empty-pattern`                                                      | `e2e/**`   | Playwright requires `{}` destructuring for fixtures without dependencies.   |
| `oxc/no-map-spread`                                                     | test files | Clashes with the preferred style of building mock data with object spread.  |

**Git hooks** (`.githooks/`, enabled by `prepare`: `git config core.hooksPath .githooks`):

- `pre-commit` runs `bun run check`.
- `commit-msg` enforces Conventional Commits:
  `^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\(scope\))?!?: .+`. It lets
  merge, revert and fixup/squash commits through.

### 14.1 CI

- **`ci.yml`** runs on pull requests and pushes to `main`, cancelling superseded runs:
  - `check`: `bun install --frozen-lockfile`, then format check, lint, typecheck, server tests,
    UI tests and a production build, as separate steps so failures are easy to read.
  - `e2e`: installs Chromium with system dependencies and runs `bun run test:e2e`; on failure it
    uploads the Playwright report and traces as an artifact.
- **`pr-title.yml`** checks the PR title against the same Conventional Commits pattern as the
  `commit-msg` hook, re-running when the title is edited.

**Conventions** (see `AGENTS.md`):

- Always install the latest dependency versions.
- Comments only where they add non-obvious _why_.
- Never commit or push unless explicitly asked.
- Tests are named "does X when Y".

---

## 15. Decision log

| #   | Decision                                                                                                 | Alternatives considered                                | Rationale                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Bun** for CLI/server, **Vite** for the UI                                                              | Bun's built-in HTML bundler (`Bun.serve` routes)       | Vite was preferred for the frontend: mature HMR, plugin ecosystem, Vitest integration. Bun stays the runtime for fast startup and simple process/file APIs.                   |
| 2   | **Own diff renderer**                                                                                    | `react-diff-view`, `@git-diff-view/react`              | Full control over markup, styling and interaction is the reason the project exists. A unified diff is a simple table.                                                         |
| 3   | **Own unified-diff parser**                                                                              | `parse-diff`, `gitdiff-parser`                         | About 100 lines, no dependency, handles spaces in paths and header-like content inside hunks, and reused by the UI test fixtures.                                             |
| 4   | **Stateless server; review state in `localStorage`**                                                     | Server-side JSON file, a file in `.git/`               | Simplest model. Survives refresh and restart, needs no cleanup, and keeps the server a pure git → JSON adapter.                                                               |
| 5   | **Default target = merge-base with main vs working tree, plus untracked**                                | `HEAD` vs working tree; `main...HEAD` (commits only)   | Reviews everything on the branch, including in-progress agent changes, in one view.                                                                                           |
| 6   | **Highlight whole files, map tokens by line number**                                                     | Highlight hunk lines only                              | Multi-line constructs (strings, comments, template literals) need full context to tokenise correctly.                                                                         |
| 7   | **Shiki core + JS regex engine, lazy grammars**                                                          | Full Shiki bundle; Oniguruma WASM; Prism/highlight.js  | GitHub-quality highlighting, dual themes via CSS variables, no WASM, and only the languages in the diff are downloaded.                                                       |
| 8   | **CSS Modules + hand-built shadcn look**                                                                 | Tailwind; shadcn/ui; Radix                             | A shadcn-like appearance without the dependency; full control; scoped styles.                                                                                                 |
| 9   | **Comments anchored to new-side line numbers, old side for deletions; snippet captured at comment time** | Anchor by hunk/line index; store only line numbers     | New-side numbers are what an agent sees in the current file. Snippets keep the copied review meaningful even if the file changes later.                                       |
| 10  | **Outdated comments are kept and surfaced**                                                              | Drop comments whose line vanished                      | Feedback is never silently lost.                                                                                                                                              |
| 11  | **Viewed = stored fingerprint must match the current diff**                                              | Plain boolean                                          | Automatically re-flags files the agent changed after you reviewed them.                                                                                                       |
| 12  | **Clear keeps viewed state**                                                                             | Clear everything                                       | Clearing usually happens after pasting feedback to an agent; review progress is still useful.                                                                                 |
| 13  | **Diff order = tree order**                                                                              | Git's path order                                       | The main view, sidebar and copied Markdown all agree.                                                                                                                         |
| 14  | **Filter hides rather than unmounts diffs**                                                              | Conditional rendering                                  | Unsaved drafts and collapse state survive filtering.                                                                                                                          |
| 15  | **Debounce in the input's change handler, inside `FileSearch`**                                          | `useDeferredValue`; a debounced-value hook in `App`    | Debouncing in `App` still re-renders the whole tree on each keystroke. Owning the text locally keeps typing cheap, and clearing stays instant.                                |
| 16  | **`content-visibility: auto` + memoised `FileDiff`**                                                     | Virtualised list                                       | Virtualisation complicates sticky headers, anchors, find-in-page and variable-height comment rows. `content-visibility` gets equivalent responsiveness with one CSS property. |
| 17  | **Drag ends via a one-off `window` `mouseup` listener added on mousedown**                               | An effect that subscribes while dragging               | No window between mousedown and the effect subscribing; simpler.                                                                                                              |
| 18  | **Three test layers; component tests render single components**                                          | Everything through `<App />`; everything in Playwright | Fast, precise failures at the owning component; `App` tests only for real cross-component wiring; Playwright reserved for browser-only concerns.                              |
| 19  | **Vitest (happy-dom) for `web/`, `bun test` for `src/`**                                                 | One runner for both                                    | `src/` needs Bun APIs; `web/` benefits from the shared Vite pipeline. happy-dom is faster than jsdom and sufficient here.                                                     |
| 20  | **Playwright: per-worker server, per-test repo reset**                                                   | A server and repo per test                             | Much faster E2E runs while keeping isolation.                                                                                                                                 |
| 21  | **oxlint + oxfmt, warnings as errors, enforced by hooks and CI; Conventional Commits**                   | ESLint + Prettier; CI-only enforcement                 | Very fast, low config; enforced locally before anything is committed, and again in CI for anything that skipped the hooks.                                                    |
| 22  | **Bind to 127.0.0.1; `bin` runs TypeScript source via Bun**                                              | 0.0.0.0; a compiled binary                             | Local-only tool; no build step needed for the CLI itself.                                                                                                                     |

---

## 16. Known limitations and future work

**Limitations:**

- **Unified view only.** No split view.
- **Expansion state isn't persisted** beyond lines with comments, and files without contents
  (over 512 KB) can't be expanded.
- **No live reload of the diff.** You press refresh after files change (planned: `fs.watch` +
  server-sent events).
- **Highlighting runs on the main thread.** It's lazy and serialised, but a very large file can
  still cause a short pause (a Web Worker would fix this).
- **Large files and binaries.** Files over 512 KB aren't highlighted. Untracked files over that
  size are shown as "binary or very large" with no content.
- **Storage keys use the target label.** For `--commit`, the label includes the commit subject,
  so rewording a commit starts a fresh review. Two tabs on the same review overwrite each other
  (last write wins).
- **The linked CLI serves `dist/`**, so after UI changes you need `bun run build` (or use
  `bun run dev`).
- **E2E isn't in pre-commit.** Run `bun run test:e2e` for UI or server changes (CI runs it on
  every pull request).
- **Windows is untested** (browser opening uses `cmd /c start`).

**Candidate next features:**

- Live diff updates (watch the repo, push over SSE; comments and viewed state already carry over
  thanks to fingerprints).
- Keyboard navigation (next/previous file and hunk, `c` to comment, `v` to toggle viewed).
- Split view.
- A "Finish review" mode that prints the Markdown to stdout and exits, so an agent can run
  `localreview` itself and wait for feedback.
- Highlighting in a Web Worker; a compiled single binary with embedded assets
  (`bun build --compile`).

---

## 17. History

See `git log`. Notable commits:

| Summary                                                                        |
| ------------------------------------------------------------------------------ |
| feat: CLI, diff API and git targets                                            |
| feat: review UI (diff view, comments, viewed tracking, file nav, filter, copy) |
| test: component, cross-component and end-to-end test suites                    |
| ci: validate pull requests with checks, E2E and Conventional Commit titles     |
