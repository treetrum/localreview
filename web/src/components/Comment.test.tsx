import { getDefaultNormalizer, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { mockComment } from "../test/fixtures";
import { CommentCard, CommentForm } from "./Comment";

describe("CommentForm", () => {
  const defaultProps = { onSubmit: vi.fn(), onCancel: vi.fn() };

  test("does submit the trimmed body when pressing Cmd+Enter or Ctrl+Enter", async () => {
    const user = userEvent.setup();
    render(<CommentForm {...defaultProps} />);
    const textarea = screen.getByRole("textbox", { name: "Comment" });
    expect(textarea).toHaveFocus();

    await user.type(textarea, "  Rename this  ");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.keyboard("{Control>}{Enter}{/Control}");
    expect(defaultProps.onSubmit.mock.calls).toEqual([["Rename this"], ["Rename this"]]);
  });

  test("does cancel when pressing Escape", async () => {
    const user = userEvent.setup();
    render(<CommentForm {...defaultProps} />);
    await user.keyboard("{Escape}");
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });

  test("does not submit when the body is blank", async () => {
    const user = userEvent.setup();
    render(<CommentForm {...defaultProps} />);
    await user.type(screen.getByRole("textbox"), "   ");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(screen.getByRole("button", { name: "Comment" })).toBeDisabled();
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });
});

describe("CommentCard", () => {
  const defaultProps = {
    comment: mockComment,
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onResolve: vi.fn(),
  };

  test("does save an edited body when editing", async () => {
    const user = userEvent.setup();
    render(<CommentCard {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveValue(mockComment.body);

    await user.clear(textarea);
    await user.type(textarea, "Better wording");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(defaultProps.onUpdate).toHaveBeenCalledWith("c1", "Better wording");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  test("does keep the original body when editing is cancelled", async () => {
    const user = userEvent.setup();
    render(<CommentCard {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Edit comment" }));
    await user.type(screen.getByRole("textbox"), " more");
    await user.keyboard("{Escape}");

    expect(defaultProps.onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText(mockComment.body)).toBeInTheDocument();
  });

  test("does delete the comment by id", async () => {
    const user = userEvent.setup();
    render(<CommentCard {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Delete comment" }));
    expect(defaultProps.onDelete).toHaveBeenCalledWith("c1");
  });

  test("does resolve the comment by id", async () => {
    const user = userEvent.setup();
    render(<CommentCard {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "Resolve comment" }));
    expect(defaultProps.onResolve).toHaveBeenCalledWith("c1", true);
  });

  test("does offer only reopen and delete when the comment is resolved", async () => {
    const user = userEvent.setup();
    render(<CommentCard {...defaultProps} comment={{ ...mockComment, resolvedAt: 2 }} />);
    expect(screen.getByText("Resolved")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit comment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Copy comment" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reopen comment" }));
    expect(defaultProps.onResolve).toHaveBeenCalledWith("c1", false);
  });

  test("does copy just this comment as Markdown feedback", async () => {
    const user = userEvent.setup();
    render(<CommentCard {...defaultProps} outdated />);
    await user.click(screen.getByRole("button", { name: "Copy comment" }));
    expect(screen.getByRole("button", { name: "Copied comment" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`## \`src/server.ts\`

### Line 6 (outdated)

\`\`\`diff
+    async fetch(req) {
\`\`\`

Why make this async?
`);
  });

  test("does show the badge and snippet when the comment is outdated", () => {
    render(<CommentCard {...defaultProps} outdated />);
    expect(screen.getByText("Outdated")).toBeInTheDocument();
    expect(
      screen.getByText("+    async fetch(req) {", {
        normalizer: getDefaultNormalizer({ collapseWhitespace: false }),
      }),
    ).toBeInTheDocument();
  });
});
