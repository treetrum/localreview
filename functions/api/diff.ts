import { snapshotPath } from "../../scripts/preview-key";

// Cloudflare Pages Function for the PR previews: static hosting ignores the query string, so this
// serves the snapshot that `scripts/preview-snapshot.ts` wrote for each diff the picker can ask for.

type Context = {
  request: Request;
  env: { ASSETS: { fetch: (input: URL) => Promise<Response> } };
};

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  const url = new URL(request.url);
  const path = snapshotPath(url.searchParams);
  const asset = path ? await env.ASSETS.fetch(new URL(path, url)) : null;
  // A missing asset falls back to index.html, so check what came back.
  if (asset?.ok && asset.headers.get("Content-Type")?.includes("json")) {
    return new Response(asset.body, {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  return Response.json(
    { error: "This preview only has the diffs the picker offers for its demo repo." },
    { status: 404 },
  );
}
