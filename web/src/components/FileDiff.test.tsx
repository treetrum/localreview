import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { demoFile, mockComment } from "../test/fixtures";
import type { ReviewActions } from "../lib/useReview";
import { FileDiff, type FileDiffProps } from "./FileDiff";

const actions: ReviewActions = {
  addComment: vi.fn(),
  updateComment: vi.fn(),
  deleteComment: vi.fn(),
  setSummary: vi.fn(),
  setViewed: vi.fn(),
  clear: vi.fn(),
};

const defaultProps: FileDiffProps = {
  file: demoFile("src/server.ts"),
  id: "file-0",
  path: "src/server.ts",
  fingerprint: "fp-server",
  viewed: false,
  comments: [],
  actions,
};

const plus = (name: string) => screen.getByRole("button", { name: `Comment on ${name}` });
const rowOf = (name: string) => plus(name).closest("tr") as HTMLElement;

async function comment(user: ReturnType<typeof userEvent.setup>, body: string) {
  await user.type(screen.getByRole("textbox", { name: "Comment" }), body);
  await user.click(screen.getByRole("button", { name: "Comment" }));
}

describe("FileDiff", () => {
  test("does anchor to the old side when commenting on a deleted line", async () => {
    const user = userEvent.setup();
    render(<FileDiff {...defaultProps} />);
    await user.click(plus("deleted line 6"));
    await comment(user, "Why?");

    expect(actions.addComment).toHaveBeenCalledWith({
      path: "src/server.ts",
      range: { start: { side: "old", line: 6 }, end: { side: "old", line: 6 } },
      snippet: [{ type: "del", content: "    fetch(req) {" }],
      body: "Why?",
    });
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  test("does select a range when shift-clicking a second line", async () => {
    const user = userEvent.setup();
    render(<FileDiff {...defaultProps} />);
    await user.click(plus("line 8"));
    await user.keyboard("{Shift>}");
    await user.click(plus("line 6"));
    await user.keyboard("{/Shift}");
    await comment(user, "Extract this");

    expect(actions.addComment).toHaveBeenCalledWith({
      path: "src/server.ts",
      range: { start: { side: "new", line: 6 }, end: { side: "new", line: 8 } },
      snippet: [
        { type: "add", content: "    async fetch(req) {" },
        { type: "add", content: "      const url = new URL(req.url);" },
        {
          type: "add",
          content: '      if (url.pathname === "/health") return new Response("ok");',
        },
      ],
      body: "Extract this",
    });
  });

  test("does span both sides when a range starts on a deleted line", async () => {
    const user = userEvent.setup();
    render(<FileDiff {...defaultProps} />);
    await user.click(plus("deleted line 6"));
    await user.keyboard("{Shift>}");
    await user.click(plus("line 6"));
    await user.keyboard("{/Shift}");
    await comment(user, "Both");

    expect(actions.addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        range: { start: { side: "old", line: 6 }, end: { side: "new", line: 6 } },
        snippet: [
          { type: "del", content: "    fetch(req) {" },
          { type: "add", content: "    async fetch(req) {" },
        ],
      }),
    );
  });

  test("does extend the selection while dragging and show the form after release", async () => {
    const user = userEvent.setup();
    render(<FileDiff {...defaultProps} />);
    fireEvent.mouseDown(plus("line 3"));
    fireEvent.mouseEnter(rowOf("line 4"));
    fireEvent.mouseEnter(rowOf("line 5"));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.mouseUp(window);
    const form = screen.getByRole("textbox").closest("tr");
    expect(form?.previousElementSibling).toBe(rowOf("line 5"));
    await comment(user, "Drag");

    expect(actions.addComment).toHaveBeenCalledWith(
      expect.objectContaining({
        range: { start: { side: "new", line: 3 }, end: { side: "new", line: 5 } },
      }),
    );
  });

  test("does select a line when the + button is activated with the keyboard", async () => {
    const user = userEvent.setup();
    render(<FileDiff {...defaultProps} />);
    plus("line 23").focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("textbox").closest("tr")?.previousElementSibling).toBe(
      rowOf("line 23"),
    );
  });

  test("does render comments below the line their range ends on", () => {
    const comments = [
      {
        ...mockComment,
        range: { start: { side: "new" as const, line: 6 }, end: { side: "new" as const, line: 8 } },
      },
    ];
    render(<FileDiff {...defaultProps} comments={comments} />);
    const card = screen.getByRole("article", { name: "Comment" });
    expect(card.closest("tr")?.previousElementSibling).toBe(rowOf("line 8"));
  });

  test("does show comments as outdated at the top when their line is gone", () => {
    const comments = [
      {
        ...mockComment,
        range: {
          start: { side: "new" as const, line: 99 },
          end: { side: "new" as const, line: 99 },
        },
      },
    ];
    render(<FileDiff {...defaultProps} comments={comments} />);
    const card = screen.getByRole("article", { name: "Comment" });
    expect(within(card).getByText("Outdated")).toBeInTheDocument();
    expect(card.closest("table")).toBeNull();
  });

  test("does add a file-level comment", async () => {
    const user = userEvent.setup();
    render(<FileDiff {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Comment on file" }));
    await comment(user, "Split this file");
    expect(actions.addComment).toHaveBeenCalledWith({
      path: "src/server.ts",
      range: null,
      snippet: [],
      body: "Split this file",
    });
  });

  test("does copy the new path when the copy file path button is clicked on a renamed file", async () => {
    const user = userEvent.setup();
    render(
      <FileDiff {...defaultProps} file={demoFile("src/util/new.ts")} path="src/util/new.ts" />,
    );
    await user.click(screen.getByRole("button", { name: "Copy file path" }));
    expect(await navigator.clipboard.readText()).toBe("src/util/new.ts");
    expect(screen.getByRole("button", { name: "Copied file path" })).toBeInTheDocument();
  });

  test("does pass the fingerprint when marking viewed and null when unmarking", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<FileDiff {...defaultProps} />);
    await user.click(screen.getByRole("checkbox", { name: "Viewed" }));
    expect(actions.setViewed).toHaveBeenLastCalledWith("src/server.ts", "fp-server");

    rerender(<FileDiff {...defaultProps} viewed />);
    await user.click(screen.getByRole("checkbox", { name: "Viewed" }));
    expect(actions.setViewed).toHaveBeenLastCalledWith("src/server.ts", null);
  });

  test("does collapse when viewed and still allow expanding manually", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<FileDiff {...defaultProps} />);
    expect(screen.getByRole("table")).toBeInTheDocument();

    rerender(<FileDiff {...defaultProps} viewed />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Expand file" }));
    expect(screen.getByRole("table")).toBeInTheDocument();

    rerender(<FileDiff {...defaultProps} viewed={false} />);
    expect(screen.getByRole("table")).toBeInTheDocument();
    rerender(<FileDiff {...defaultProps} viewed />);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("does show a notice instead of lines when the file is binary", () => {
    render(<FileDiff {...defaultProps} file={{ ...defaultProps.file, binary: true, hunks: [] }} />);
    expect(screen.getByText("Binary or very large file not shown.")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  test("does show both paths when the file is renamed", () => {
    render(
      <FileDiff {...defaultProps} file={demoFile("src/util/new.ts")} path="src/util/new.ts" />,
    );
    expect(
      screen.getByRole("heading", { name: "src/util/old.ts → src/util/new.ts" }),
    ).toBeInTheDocument();
  });
});
