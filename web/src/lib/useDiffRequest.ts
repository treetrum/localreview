import { useCallback, useEffect, useState } from "react";
import { fromSearchParams, toSearchParams, type DiffRequest } from "../../../shared/types";

function readUrl(): DiffRequest {
  try {
    return fromSearchParams(new URLSearchParams(window.location.search));
  } catch {
    // Drop a malformed query so the URL matches the default diff that's shown instead.
    window.history.replaceState(null, "", window.location.pathname);
    return {};
  }
}

/** The diff request lives in the URL, so a reload keeps it and back/forward step through picks. */
export function useDiffRequest(): [DiffRequest, (next: DiffRequest) => void] {
  const [request, setRequest] = useState(readUrl);

  useEffect(() => {
    const onPopState = () => setRequest(readUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((next: DiffRequest) => {
    const query = toSearchParams(next).toString();
    window.history.pushState(null, "", query ? `?${query}` : window.location.pathname);
    setRequest(next);
  }, []);

  return [request, navigate];
}
