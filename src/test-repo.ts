import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** A throwaway git repository for tests. Not a test file itself. */
export function createTestRepo() {
  const root = mkdtempSync(join(tmpdir(), "localreview-test-"));
  const run = (...args: string[]) => {
    const result = Bun.spawnSync(["git", ...args], { cwd: root, stderr: "pipe" });
    if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
    return result.stdout.toString().trim();
  };
  run("init", "-q", "-b", "main");
  run("config", "user.email", "test@example.com");
  run("config", "user.name", "Test");
  run("config", "commit.gpgsign", "false");

  return {
    root,
    git: run,
    write(path: string, content: string | Uint8Array) {
      const absolute = join(root, path);
      mkdirSync(dirname(absolute), { recursive: true });
      writeFileSync(absolute, content);
    },
    commit(message: string) {
      run("add", "-A");
      run("commit", "-q", "--allow-empty", "-m", message);
      return run("rev-parse", "HEAD");
    },
    remove() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export type TestRepo = ReturnType<typeof createTestRepo>;
