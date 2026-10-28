# localreview

Review a local git diff in the browser, leave comments on lines, ranges, files or the whole change,
then copy everything as one Markdown document to paste into an AI coding agent.

```
agent makes changes ──► localreview ──► review in browser ──► Copy review
        ▲                                                         │
        └──────────── paste Markdown into the agent ◄─────────────┘
```

## Install

Requires [Bun](https://bun.sh) and git.

```sh
git clone <this repo> localreview
cd localreview
bun install
bun run build   # builds the UI into dist/
bun link        # puts `localreview` on your PATH, running from source
```

After pulling UI changes, run `bun run build` again.

## Usage

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

By default localreview shows everything on the current branch (committed, uncommitted and
untracked) against its merge-base with `main` (or `master`).

In the browser:

- Hover a line and click **+** to comment. Drag across rows, or shift-click a second **+**, for a
  range.
- Click the arrows on a hunk header to show more unchanged lines around it, or **Expand all lines**
  in the file header to show the whole file. Expanded lines can be commented on too.
- **Comment on file** for file-level feedback; **Overall feedback** for the whole change.
- ⌘/Ctrl+↵ submits a comment, Esc cancels.
- Tick **Viewed** to collapse a file. If the file's diff changes later, it's un-marked
  automatically.
- Switch between a **unified** and a **split** (side-by-side) diff with the toggle in the header.
  The choice is remembered.
- `/` focuses the file filter; Esc clears it.
- **Refresh** reloads the diff from git after the agent edits files. Comments are kept.
- **Copy review** copies all feedback as Markdown. **Clear** removes feedback but keeps viewed
  marks.

Review state is stored in the browser's `localStorage`, per repository and diff target.

## Development

```sh
LOCALREVIEW_REPO=/path/to/some/repo bun run dev   # API on :4173 + Vite on :5173 with HMR
bun run check      # format check, lint, typecheck, server and UI tests (also the pre-commit hook)
bun run test:e2e   # build + Playwright end-to-end tests
bun run format     # format everything
```

See [`AGENTS.md`](AGENTS.md) for conventions and [`ARCHITECTURE.md`](ARCHITECTURE.md) for how it
works.
