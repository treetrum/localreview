import { useEffect, useMemo, useState } from "react";
import { emptyReview, type NewComment, type ReviewState } from "./review";

export type ReviewActions = {
  addComment: (comment: NewComment) => void;
  updateComment: (id: string, body: string) => void;
  deleteComment: (id: string) => void;
  setSummary: (summary: string) => void;
  setViewed: (path: string, fingerprint: string | null) => void;
  /** Removes the summary and comments but keeps viewed marks. */
  clear: () => void;
};

function load(key: string): ReviewState {
  const empty = emptyReview();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const saved = JSON.parse(raw) as Partial<ReviewState> | null;
    if (!saved || typeof saved !== "object") return empty;
    // Merge over the empty state so reviews saved by older versions still load.
    return {
      summary: typeof saved.summary === "string" ? saved.summary : empty.summary,
      comments: Array.isArray(saved.comments) ? saved.comments : empty.comments,
      viewed: saved.viewed && typeof saved.viewed === "object" ? saved.viewed : empty.viewed,
    };
  } catch {
    return empty;
  }
}

export function useReview(storageKey: string): { review: ReviewState; actions: ReviewActions } {
  const [review, setReview] = useState(() => load(storageKey));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(review));
    } catch {
      // Storage full or unavailable: keep working in memory.
    }
  }, [storageKey, review]);

  const actions = useMemo<ReviewActions>(
    () => ({
      addComment: (comment) =>
        setReview((r) => ({
          ...r,
          comments: [...r.comments, { ...comment, id: crypto.randomUUID(), createdAt: Date.now() }],
        })),
      updateComment: (id, body) =>
        setReview((r) => ({
          ...r,
          comments: r.comments.map((c) => (c.id === id ? { ...c, body } : c)),
        })),
      deleteComment: (id) =>
        setReview((r) => ({ ...r, comments: r.comments.filter((c) => c.id !== id) })),
      setSummary: (summary) => setReview((r) => ({ ...r, summary })),
      setViewed: (path, fingerprint) =>
        setReview((r) => {
          const viewed = { ...r.viewed };
          if (fingerprint === null) delete viewed[path];
          else viewed[path] = fingerprint;
          return { ...r, viewed };
        }),
      clear: () => setReview((r) => ({ ...emptyReview(), viewed: r.viewed })),
    }),
    [],
  );

  return { review, actions };
}
