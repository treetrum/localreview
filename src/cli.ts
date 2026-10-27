#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { GitError, loadDiff, tryGit, type DiffTarget } from "./git";
import { startServer } from "./server";

const USAGE = `Usage: localreview [base-ref] [options]

Review a git diff in the browser and copy your comments as Markdown.

Arguments:
  base-ref              Compare against this ref instead of main/master

Options:
  --staged              Review staged changes only
  --commit <sha>        Review a single commit
  -C, --cwd <dir>       Run as if started in <dir>
  -p, --port <port>     Port to listen on (default: 4180)
  --no-open             Don't open the browser
  -h, --help            Show this help`;

function fail(message: string, code = 1): never {
  console.error(`localreview: ${message}`);
  process.exit(code);
}

function parse() {
  try {
    return parseArgs({
      allowPositionals: true,
      options: {
        staged: { type: "boolean" },
        commit: { type: "string" },
        cwd: { type: "string", short: "C" },
        port: { type: "string", short: "p" },
        "no-open": { type: "boolean" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    console.error(`localreview: ${(error as Error).message}\n\n${USAGE}`);
    process.exit(2);
  }
}

const { values, positionals } = parse();

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (positionals.length > 1) fail(`expected at most one base ref, got ${positionals.length}`, 2);

const [baseRef] = positionals;
const targets = [baseRef !== undefined, values.staged === true, values.commit !== undefined];
if (targets.filter(Boolean).length > 1) {
  fail("base-ref, --staged and --commit are mutually exclusive", 2);
}

let port: number | undefined;
if (values.port !== undefined) {
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port: ${values.port}`, 2);
}

const target: DiffTarget = values.staged
  ? { kind: "staged" }
  : values.commit !== undefined
    ? { kind: "commit", sha: values.commit }
    : { kind: "branch", base: baseRef };

const cwd = resolve(values.cwd ?? process.cwd());
if (!existsSync(cwd)) fail(`no such directory: ${cwd}`);
if ((await tryGit(cwd, ["rev-parse", "--is-inside-work-tree"]))?.trim() !== "true") {
  fail(`not a git repository: ${cwd}`);
}

// Resolve once up front so a bad ref fails here rather than in the browser.
let label: string;
try {
  label = (await loadDiff(cwd, target)).label;
} catch (error) {
  fail(error instanceof GitError ? error.message : String(error));
}

const distDir = resolve(import.meta.dir, "../dist");
if (!existsSync(join(distDir, "index.html"))) {
  console.warn("localreview: the UI hasn't been built yet. Run `bun run build` first.");
}

let server: ReturnType<typeof startServer>;
try {
  server = startServer({ cwd, target, distDir, port });
} catch (error) {
  fail(`couldn't start the server: ${(error as Error).message}`);
}
const url = `http://127.0.0.1:${server.port}`;
console.log(`localreview: ${label}\n  ${url}`);

if (!values["no-open"]) openBrowser(url);

function openBrowser(link: string) {
  const command =
    process.platform === "darwin"
      ? ["open", link]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", link]
        : ["xdg-open", link];
  try {
    Bun.spawn(command, { stdin: "ignore", stdout: "ignore", stderr: "ignore" });
  } catch {
    console.warn(`localreview: couldn't open a browser; visit ${link}`);
  }
}
