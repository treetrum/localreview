#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { GitError, loadDiff, tryGit } from "./git";
import { startServer } from "./server";

const USAGE = `Usage: localreview [options]

Review a git diff in the browser and copy your comments as Markdown. It starts on the current
branch vs main/master; pick another base, uncommitted or staged changes, or commits in the UI.

Options:
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
      options: {
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

const { values } = parse();

if (values.help) {
  console.log(USAGE);
  process.exit(0);
}

let port: number | undefined;
if (values.port !== undefined) {
  port = Number(values.port);
  if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port: ${values.port}`, 2);
}

const cwd = resolve(values.cwd ?? process.cwd());
if (!existsSync(cwd)) fail(`no such directory: ${cwd}`);
if ((await tryGit(cwd, ["rev-parse", "--is-inside-work-tree"]))?.trim() !== "true") {
  fail(`not a git repository: ${cwd}`);
}

// Load once up front so git problems show up here rather than only in the browser.
let label: string;
try {
  label = (await loadDiff(cwd)).label;
} catch (error) {
  fail(error instanceof GitError ? error.message : String(error));
}

const distDir = resolve(import.meta.dir, "../dist");
if (!existsSync(join(distDir, "index.html"))) {
  console.warn("localreview: the UI hasn't been built yet. Run `bun run build` first.");
}

let server: ReturnType<typeof startServer>;
try {
  server = startServer({ cwd, distDir, port });
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
