import { stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { fromSearchParams, type DiffRequest, type ErrorResponse } from "../shared/types";
import { GitError, loadDiff } from "./git";

export const DEFAULT_PORT = 4180;
const PORT_ATTEMPTS = 20;

export type ServerOptions = {
  cwd: string;
  distDir: string;
  /** An explicit port is strict; otherwise the first free port from DEFAULT_PORT is used. */
  port?: number;
};

export function startServer({ cwd, distDir, port }: ServerOptions) {
  const serve = (candidate: number) =>
    Bun.serve({
      hostname: "127.0.0.1",
      port: candidate,
      fetch: (req) => handle(req, cwd, distDir),
    });

  if (port !== undefined) return serve(port);
  for (let attempt = 0; ; attempt++) {
    try {
      return serve(DEFAULT_PORT + attempt);
    } catch (error) {
      const inUse = (error as { code?: string }).code === "EADDRINUSE";
      if (!inUse || attempt >= PORT_ATTEMPTS) throw error;
    }
  }
}

async function handle(req: Request, cwd: string, distDir: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }
  const url = new URL(req.url);

  if (url.pathname === "/api/diff") {
    let request: DiffRequest;
    try {
      request = fromSearchParams(url.searchParams);
    } catch (error) {
      const body: ErrorResponse = { error: (error as Error).message };
      return Response.json(body, { status: 400 });
    }
    try {
      return Response.json(await loadDiff(cwd, request), {
        headers: { "Cache-Control": "no-store" },
      });
    } catch (error) {
      const body: ErrorResponse = {
        error: error instanceof GitError ? error.message : String(error),
      };
      return Response.json(body, { status: 500 });
    }
  }
  if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });

  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  // Normalising as an absolute path collapses ".." so lookups stay inside distDir.
  const asset = join(distDir, normalize(`/${pathname}`));
  if (await isFile(asset)) return new Response(Bun.file(asset));

  const index = join(distDir, "index.html");
  if (await isFile(index)) return new Response(Bun.file(index));
  return new Response("The localreview UI hasn't been built. Run `bun run build`.", {
    status: 503,
  });
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
