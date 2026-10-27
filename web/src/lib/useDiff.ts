import { useCallback, useEffect, useState } from "react";
import type { DiffResponse, ErrorResponse } from "../../../shared/types";

export type DiffState = {
  data: DiffResponse | null;
  error: string | null;
  loading: boolean;
  refresh: () => void;
};

async function fetchDiff(): Promise<DiffResponse> {
  const res = await fetch("/api/diff", { cache: "no-store" });
  const body = (await res.json()) as DiffResponse | ErrorResponse;
  if ("error" in body) throw new Error(body.error);
  if (!res.ok) throw new Error(res.statusText);
  return body;
}

export function useDiff(): DiffState {
  const [data, setData] = useState<DiffResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [request, setRequest] = useState(fetchDiff);

  useEffect(() => {
    let current = true;
    request
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
  }, [request]);

  const refresh = useCallback(() => {
    setLoading(true);
    setRequest(fetchDiff());
  }, []);

  return { data, error, loading, refresh };
}
