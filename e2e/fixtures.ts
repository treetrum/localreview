import { test as base } from "@playwright/test";
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const LONG_LINES = 200;

type Repo = {
  root: string;
  write: (path: string, content: string) => void;
};

type Server = { url: string; repo: Repo };

function createRepo(): Repo & { git: (...args: string[]) => void; remove: () => void } {
  const root = mkdtempSync(join(tmpdir(), "localreview-e2e-"));
  const git = (...args: string[]) => {
    execFileSync("git", args, { cwd: root, stdio: ["ignore", "ignore", "pipe"] });
  };
  const write = (path: string, content: string) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  return { root, git, write, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** Uncommitted and untracked changes, re-applied after every test. */
function applyWorkingChanges(repo: Repo) {
  repo.write("README.md", "# Demo\n\nUncommitted line.\n");
  repo.write("notes/todo.txt", "remember\n");
  repo.write(
    "src/long.ts",
    Array.from({ length: LONG_LINES }, (_, i) => `export const n${i} = ${i};`).join("\n") + "\n",
  );
}

export const test = base.extend<{ repo: Repo }, { server: Server }>({
  server: [
    async ({}, use) => {
      const repo = createRepo();
      repo.git("init", "-q", "-b", "main");
      repo.git("config", "user.email", "e2e@example.com");
      repo.git("config", "user.name", "E2E");
      repo.git("config", "commit.gpgsign", "false");
      repo.write(
        "src/app.ts",
        'export function greet(name: string) {\n  return "Hello, " + name;\n}\n\nexport function farewell(name: string) {\n  return "Bye, " + name;\n}\n',
      );
      repo.write("README.md", "# Demo\n");
      repo.git("add", "-A");
      repo.git("commit", "-q", "-m", "initial");
      repo.git("checkout", "-q", "-b", "feature");
      repo.write(
        "src/app.ts",
        'export function greet(name: string) {\n  const greeting = `Hello, ${name}!`;\n  return greeting;\n}\n\nexport function farewell(name: string) {\n  return "Bye, " + name;\n}\n',
      );
      repo.git("commit", "-q", "-am", "feature work");
      applyWorkingChanges(repo);

      const proc = spawn("bun", ["src/cli.ts", "--cwd", repo.root, "--port", "0", "--no-open"], {
        stdio: ["ignore", "pipe", "inherit"],
      });
      const url = await readUrl(proc);
      await use({ url, repo });
      const exited = once(proc, "exit");
      proc.kill();
      await exited;
      repo.remove();
    },
    { scope: "worker" },
  ],

  repo: [
    async ({ server }, use) => {
      await use(server.repo);
      const repo = server.repo as ReturnType<typeof createRepo>;
      repo.git("reset", "-q", "--hard");
      repo.git("clean", "-fdq");
      applyWorkingChanges(repo);
    },
    { auto: true },
  ],

  baseURL: async ({ server }, use) => {
    await use(server.url);
  },
});

async function readUrl(proc: ChildProcess): Promise<string> {
  let output = "";
  for await (const chunk of proc.stdout ?? []) {
    output += String(chunk);
    const match = /http:\/\/127\.0\.0\.1:\d+/.exec(output);
    if (match) return match[0];
  }
  throw new Error(`localreview exited without printing a URL:\n${output}`);
}

export { expect } from "@playwright/test";
