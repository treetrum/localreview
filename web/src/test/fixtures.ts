import type { CommitInfo, DiffFile, DiffResponse } from "../../../shared/types";
import { addedFile, parseDiff } from "../../../src/parse-diff";
import type { ReviewComment } from "../lib/review";

export const demoDiffText = `diff --git a/src/server.ts b/src/server.ts
index 1111111..2222222 100644
--- a/src/server.ts
+++ b/src/server.ts
@@ -3,7 +3,9 @@ import { serve } from "bun";
 const port = 3000;
 
 serve({
-    fetch(req) {
+    async fetch(req) {
+      const url = new URL(req.url);
+      if (url.pathname === "/health") return new Response("ok");
       return new Response("hello");
     },
 });
@@ -20,3 +22,3 @@ export function stop() {
 export function log() {
-  console.log("old");
+  console.log("new");
 }
diff --git a/src/util/old.ts b/src/util/new.ts
similarity index 90%
rename from src/util/old.ts
rename to src/util/new.ts
index 3333333..4444444 100644
--- a/src/util/old.ts
+++ b/src/util/new.ts
@@ -1,2 +1,2 @@
-export const name = "old";
+export const name = "new";
 export const value = 1;
diff --git a/docs/notes.md b/docs/notes.md
deleted file mode 100644
index 5555555..0000000
--- a/docs/notes.md
+++ /dev/null
@@ -1,2 +0,0 @@
-# Notes
-Remove me.
`;

export const demoFiles: DiffFile[] = [
  ...parseDiff(demoDiffText),
  addedFile("scripts/setup.sh", "#!/bin/sh\necho hi\n", "untracked"),
];

const filler = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `// line ${from + i}`);

/** New contents of src/server.ts matching its hunks: lines 1–2, 12–21 and 25–50 are unchanged. */
export const demoServerContent = [
  'import { serve } from "bun";',
  "",
  "const port = 3000;",
  "",
  "serve({",
  "    async fetch(req) {",
  "      const url = new URL(req.url);",
  '      if (url.pathname === "/health") return new Response("ok");',
  '      return new Response("hello");',
  "    },",
  "});",
  ...filler(12, 21),
  "export function log() {",
  '  console.log("new");',
  "}",
  ...filler(25, 50),
  "",
].join("\n");

/** Newest first, like the API. */
export const demoCommits: CommitInfo[] = [
  ["c3c3c3c3c3c3c3c3", "Add a health check"],
  ["b2b2b2b2b2b2b2b2", "Log the new message"],
  ["a1a1a1a1a1a1a1a1", "Rename util/old to util/new"],
].map(([sha = "", subject = ""], index) => ({
  sha,
  subject,
  author: "Ada",
  date: `2026-10-0${3 - index}T09:00:00Z`,
}));

export const demoDiff: DiffResponse = {
  repoName: "demo",
  repoRoot: "/tmp/demo",
  branch: "feature",
  label: "feature vs main",
  target: { kind: "branch" },
  base: "main",
  baseSha: "abc1234def567890",
  branches: ["feature", "main", "origin/main"],
  commits: demoCommits,
  commitsScope: "branch",
  files: demoFiles,
};

export function demoFile(path: string): DiffFile {
  const file = demoFiles.find((f) => f.newPath === path || f.oldPath === path);
  if (!file) throw new Error(`No demo file ${path}`);
  return file;
}

export const mockComment: ReviewComment = {
  id: "c1",
  path: "src/server.ts",
  range: { start: { side: "new", line: 6 }, end: { side: "new", line: 6 } },
  snippet: [{ type: "add", content: "    async fetch(req) {" }],
  body: "Why make this async?",
  createdAt: 1,
};
