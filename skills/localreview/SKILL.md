---
name: localreview
description: Hand changes to the user for review in the browser with localreview, and act on the Markdown review they paste back. Use after finishing a change the user will want to review, when the user asks to review a diff locally, or when a message starts with "# Code review:".
---

# localreview

localreview is a local web UI for reviewing a git diff. The user comments on lines, ranges, files
or the whole change, then clicks **Copy review** and pastes the feedback to you as Markdown. You fix
it, they refresh the page and review again.

```
you make changes ──► localreview ──► user reviews in browser ──► Copy review
        ▲                                                            │
        └────────────── user pastes the Markdown to you ◄────────────┘
```

## Handing changes over for review

- Leave your work in the working tree. You don't need to commit: the default diff is the current
  branch against its merge-base with `origin/main` (or `main`/`master`), **including uncommitted
  and untracked files**. Only commit if the user asks.
- If localreview isn't already running for this repo, start it from the repo root as a
  long-running background process (it serves until stopped):

  ```sh
  localreview            # opens the browser; picks the first free port from 4180
  localreview --no-open  # just print the URL
  localreview -C <dir>   # review another repo
  ```

  It prints the diff label and URL. Tell the user the URL. If `localreview` isn't installed, say
  so rather than working around it.

- If it's already running, don't start another: tell the user to hit **Refresh** in the header.
  Comments persist across refreshes and restarts, and files whose diff changed are un-marked as
  viewed automatically.
- The user can pick a different diff in the UI (uncommitted only, staged only, a commit or a
  range, another base), so you don't need to arrange the git state for them.

## Reading a pasted review

A review looks like this:

````md
# Code review: feature vs origin/main

Please address the following review feedback. Line numbers refer to the new version of each file unless marked as deleted.

## Overall

Feedback on the change as a whole.

## `src/server.ts`

A file-level comment (no line heading).

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

- `# Code review: <label>` names the diff that was reviewed, e.g. `feature vs origin/main`,
  `Uncommitted changes on feature`, `Staged changes on feature` or a commit.
- `## Overall` is feedback on the whole change; it's optional.
- Each `` ## `path` `` section is one file. Text directly under it, before any `###`, is about the
  whole file.
- `### Line N` / `### Lines A–B` are line numbers in the **new** version of the file.
  `(deleted)` means old-side numbers on removed lines. `Lines old A–new B` spans both sides.
- `(outdated)` means the commented lines no longer exist in the diff (the file has changed since).
  Use the snippet and comment to find what it was about, and say if it no longer applies.
- The `diff` snippet is the code as it was **when the comment was written**, with `+`/`-`/space
  prefixes. Lines may have moved since, so locate the code by its content, not just the number.
- A single comment can arrive on its own (copied with **Copy comment**): same shape, without the
  title or overall section.

## Acting on it

- Address every comment. Some are questions: answer them, and only change code if the answer
  shows it should change. If you disagree with a comment, say why instead of silently skipping it.
- Read the current file before editing; don't trust the snippet's line numbers.
- When done, reply with a short list mapping each comment (file and line label) to what you did,
  and any you didn't act on and why. Then ask the user to hit **Refresh** to review again.
- Resolved comments are left out of the copy, so everything in the paste is still open. The user
  resolves comments in the UI; you can't.
