import { act, renderHook } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { mockComment } from "../test/fixtures";
import type { NewComment } from "./review";
import { useReview } from "./useReview";

const KEY = "localreview:/repo:feature vs main";
const newComment: NewComment = {
  path: mockComment.path,
  range: mockComment.range,
  snippet: mockComment.snippet,
  body: mockComment.body,
};
const saved = (key = KEY) => JSON.parse(localStorage.getItem(key) ?? "null");

describe("useReview", () => {
  test("does persist added comments when they are added", () => {
    const { result } = renderHook(() => useReview(KEY));
    act(() => result.current.actions.addComment(newComment));

    const [comment] = result.current.review.comments;
    expect(comment).toMatchObject(newComment);
    expect(comment?.id).toEqual(expect.any(String));
    expect(saved().comments).toEqual([comment]);
  });

  test("does restore saved state when mounted again", () => {
    const first = renderHook(() => useReview(KEY));
    act(() => first.result.current.actions.setSummary("Looks good"));
    first.unmount();

    const { result } = renderHook(() => useReview(KEY));
    expect(result.current.review.summary).toBe("Looks good");
  });

  test("does keep reviews separate when storage keys differ", () => {
    const a = renderHook(() => useReview(KEY));
    act(() => a.result.current.actions.setSummary("A"));
    const b = renderHook(() => useReview(`${KEY}:other`));
    expect(b.result.current.review.summary).toBe("");
  });

  test("does edit and delete a comment by id", () => {
    const { result } = renderHook(() => useReview(KEY));
    act(() => {
      result.current.actions.addComment(newComment);
      result.current.actions.addComment({ ...newComment, body: "Second" });
    });
    const [first, second] = result.current.review.comments;

    act(() => result.current.actions.updateComment(first?.id ?? "", "Edited"));
    expect(result.current.review.comments.map((c) => c.body)).toEqual(["Edited", "Second"]);

    act(() => result.current.actions.deleteComment(first?.id ?? ""));
    expect(result.current.review.comments).toEqual([second]);
  });

  test("does set and unset viewed fingerprints", () => {
    const { result } = renderHook(() => useReview(KEY));
    act(() => result.current.actions.setViewed("a.ts", "fp1"));
    expect(result.current.review.viewed).toEqual({ "a.ts": "fp1" });
    act(() => result.current.actions.setViewed("a.ts", null));
    expect(result.current.review.viewed).toEqual({});
  });

  test("does keep viewed marks when clearing feedback", () => {
    const { result } = renderHook(() => useReview(KEY));
    act(() => {
      result.current.actions.addComment(newComment);
      result.current.actions.setSummary("Summary");
      result.current.actions.setViewed("a.ts", "fp1");
    });
    act(() => result.current.actions.clear());

    expect(result.current.review).toEqual({ summary: "", comments: [], viewed: { "a.ts": "fp1" } });
    expect(saved()).toEqual(result.current.review);
  });

  test("does load reviews saved without viewed state", () => {
    localStorage.setItem(KEY, JSON.stringify({ summary: "Old", comments: [mockComment] }));
    const { result } = renderHook(() => useReview(KEY));
    expect(result.current.review).toEqual({ summary: "Old", comments: [mockComment], viewed: {} });
  });

  test("does start empty when saved data is corrupt", () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() => useReview(KEY));
    expect(result.current.review).toEqual({ summary: "", comments: [], viewed: {} });
  });

  test("does start empty when saved fields have the wrong types", () => {
    localStorage.setItem(KEY, JSON.stringify({ summary: 1, comments: "x", viewed: null }));
    const { result } = renderHook(() => useReview(KEY));
    expect(result.current.review).toEqual({ summary: "", comments: [], viewed: {} });
  });

  test("does keep actions stable across updates", () => {
    const { result } = renderHook(() => useReview(KEY));
    const { actions } = result.current;
    act(() => actions.setSummary("changed"));
    expect(result.current.actions).toBe(actions);
  });
});
