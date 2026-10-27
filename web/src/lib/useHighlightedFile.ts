import { useEffect, useState, type RefObject } from "react";
import type { DiffFile } from "../../../shared/types";
import { highlightFile, type HighlightedFile } from "./highlight";

/** Highlights a file once it comes within 1000px of the viewport. */
export function useHighlightedFile(
  ref: RefObject<HTMLElement | null>,
  file: DiffFile,
): HighlightedFile | null {
  const [near, setNear] = useState(false);
  const [result, setResult] = useState<{ file: DiffFile; tokens: HighlightedFile | null } | null>(
    null,
  );

  useEffect(() => {
    const element = ref.current;
    if (near || !element || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNear(true);
          observer.disconnect();
        }
      },
      { rootMargin: "1000px 0px" },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref, near]);

  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    highlightFile(file).then(
      (tokens) => {
        if (!cancelled) setResult({ file, tokens });
      },
      () => {
        if (!cancelled) setResult({ file, tokens: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [near, file]);

  return result?.file === file ? result.tokens : null;
}
