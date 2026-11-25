import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { mockComment } from "../test/fixtures";
import { CommentsPanel } from "./CommentsPanel";

const resolvedComment = { ...mockComment, id: "c2", body: "Typo fixed", resolvedAt: 5 };
const goneComment = { ...mockComment, id: "c3", path: "old/gone.ts", range: null, snippet: [] };

describe("CommentsPanel", () => {
  const defaultProps = {
    comments: [mockComment, resolvedComment],
    paths: ["src/server.ts"],
    onJump: vi.fn(),
    onResolve: vi.fn(),
    onClose: vi.fn(),
  };
  const jump = "Go to comment: Line 6 in src/server.ts";

  test("does show open comments with their file, line and snippet when opened", () => {
    render(<CommentsPanel {...defaultProps} />);
    const panel = screen.getByRole("region", { name: "Comments" });
    expect(within(panel).getByRole("heading", { name: /server\.ts/ })).toHaveAttribute(
      "title",
      "src/server.ts",
    );
    const item = within(panel).getByRole("button", { name: jump });
    expect(item).toHaveTextContent("Line 6");
    expect(item).toHaveTextContent("+async fetch(req) {", { normalizeWhitespace: false });
    expect(item).toHaveTextContent("Why make this async?");
    expect(within(panel).queryByText("Typo fixed")).not.toBeInTheDocument();
  });

  test("does jump to the comment when it's clicked", async () => {
    const user = userEvent.setup();
    render(<CommentsPanel {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: jump }));
    expect(defaultProps.onJump).toHaveBeenCalledWith(mockComment);
  });

  test("does resolve an open comment and reopen a resolved one", async () => {
    const user = userEvent.setup();
    render(<CommentsPanel {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Resolve comment: Line 6" }));

    await user.click(screen.getByRole("button", { name: /^Resolved/ }));
    expect(screen.getByText("Typo fixed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reopen comment: Line 6" }));
    expect(defaultProps.onResolve.mock.calls).toEqual([
      ["c1", true],
      ["c2", false],
    ]);
  });

  test("does disable jumping when the comment's file is no longer in the diff", () => {
    render(<CommentsPanel {...defaultProps} comments={[goneComment]} />);
    expect(
      screen.getByRole("button", { name: "Go to comment: File comment in old/gone.ts" }),
    ).toBeDisabled();
    expect(screen.getByText(/not in this diff/)).toBeInTheDocument();
  });

  test("does say so when every comment is resolved", () => {
    render(<CommentsPanel {...defaultProps} comments={[resolvedComment]} />);
    expect(screen.getByText("All comments are resolved.")).toBeInTheDocument();
  });

  test("does close when the close button is clicked", async () => {
    const user = userEvent.setup();
    render(<CommentsPanel {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Close comments" }));
    expect(defaultProps.onClose).toHaveBeenCalledOnce();
  });
});
