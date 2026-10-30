import { useCallback, useEffect, useState } from "react";
import {
  toSearchParams,
  type DiffRequest,
  type DiffResponse,
  type ErrorResponse,
} from "../../../shared/types";

export type DiffState = {
  data: DiffResponse | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

async function fetchDiff(query: string): Promise<DiffResponse> {
  const res = await fetch(query ? `/api/diff?${query}` : "/api/diff", { cache: "no-store" });
  const body = (await res.json()) as DiffResponse | ErrorResponse;
  if ("error" in body) throw new Error(body.error);
  if (!res.ok) throw new Error(res.statusText);
  return body;
}

/** Fetches the diff for `request`, refetching when it changes. The last diff stays until then. */
export function useDiff(request: DiffRequest): DiffState {
  const query = toSearchParams(request).toString();
  const [data, setData] = useState<DiffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(() => fetchDiff(query));
  const [pendingQuery, setPendingQuery] = useState(query);
  if (query !== pendingQuery) {
    setPendingQuery(query);
    setLoading(true);
    setPending(fetchDiff(query));
  }

  useEffect(() => {
    let current = true;
    pending
      .then(
        (diff) => {
          if (!current) return;
          setData(diff);
          setError(null);
        },
        (err: unknown) => {
          if (current) setError(err instanceof Error ? err.message : String(err));
        },
      )
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [pending]);

  const refresh = useCallback(() => {
    setLoading(true);
    setPending(fetchDiff(pendingQuery));
  }, [pendingQuery]);

  return { data, error, loading, refresh };
}
