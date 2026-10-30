import { fromSearchParams, toSearchParams } from "../shared/types";

/**
 * Where the preview keeps the snapshot for a `/api/diff` query, shared by the snapshot script and
 * the Pages Function that serves it. Null if the query is malformed.
 */
export function snapshotPath(params: URLSearchParams): string | null {
  let query: string;
  try {
    query = toSearchParams(fromSearchParams(params)).toString();
  } catch {
    return null;
  }
  return `/snapshots/${query.replaceAll(/[^\w.-]/g, "_") || "default"}.json`;
}
