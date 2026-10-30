import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiffResponse } from "../shared/types";
import { startServer } from "./server";
import { createTestRepo, type TestRepo } from "./test-repo";

let repo: TestRepo;
let distDir: string;
let server: ReturnType<typeof startServer>;
let base: string;

beforeAll(() => {
  repo = createTestRepo();
  repo.write("a.ts", "a\n");
  repo.commit("initial");
  repo.write("a.ts", "b\n");

  distDir = mkdtempSync(join(tmpdir(), "localreview-dist-"));
  writeFileSync(join(distDir, "index.html"), "<html>app</html>");
  mkdirSync(join(distDir, "assets"));
  writeFileSync(join(distDir, "assets", "app.js"), "console.log(1)");
  writeFileSync(join(tmpdir(), "localreview-secret.txt"), "secret");

  server = startServer({ cwd: repo.root, target: { kind: "branch" }, distDir, port: 0 });
  base = `http://127.0.0.1:${server.port}`;
});

afterAll(() => {
  server.stop(true);
  repo.remove();
  rmSync(distDir, { recursive: true, force: true });
});

describe("server", () => {
  test("does return the diff as JSON when requesting /api/diff", async () => {
    const res = await fetch(`${base}/api/diff`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as DiffResponse;
    expect(body.files.map((file) => file.newPath)).toEqual(["a.ts"]);
  });

  test("does return the git error with status 500 when the diff fails", async () => {
    const bad = startServer({
      cwd: repo.root,
      target: { kind: "branch", base: "missing" },
      distDir,
      port: 0,
    });
    try {
      const res = await fetch(`http://127.0.0.1:${bad.port}/api/diff`);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "Unknown revision: missing" });
    } finally {
      bad.stop(true);
    }
  });

  test("does serve static files from dist", async () => {
    const res = await fetch(`${base}/assets/app.js`);
    expect(await res.text()).toBe("console.log(1)");
  });

  test("does fall back to index.html when the path is not a file", async () => {
    expect(await (await fetch(`${base}/some/route`)).text()).toBe("<html>app</html>");
    expect(await (await fetch(`${base}/`)).text()).toBe("<html>app</html>");
  });

  test("does stay inside dist when the path escapes with ..", async () => {
    const res = await fetch(`${base}/%2e%2e/localreview-secret.txt`);
    expect(await res.text()).toBe("<html>app</html>");
  });

  test("does return 404 for unknown API routes", async () => {
    expect((await fetch(`${base}/api/nope`)).status).toBe(404);
  });

  test("does try the next port when the default is in use", () => {
    const first = startServer({ cwd: repo.root, target: { kind: "branch" }, distDir });
    const second = startServer({ cwd: repo.root, target: { kind: "branch" }, distDir });
    try {
      expect(second.port).toBeGreaterThan(first.port ?? 0);
    } finally {
      first.stop(true);
      second.stop(true);
    }
  });

  test("does throw when an explicit port is in use", () => {
    expect(() =>
      startServer({ cwd: repo.root, target: { kind: "branch" }, distDir, port: server.port }),
    ).toThrow();
  });
});
