import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { buildTree, treeOrder } from "../lib/tree";
import { demoFiles } from "../test/fixtures";
import { DEBOUNCE_MS, FileNav, type FileNavProps } from "./FileNav";

const tree = buildTree(demoFiles);
const files = treeOrder(tree);

const onQueryChange = vi.fn<(query: string) => void>();
const defaultProps: FileNavProps = {
  tree,
  files,
  totalCount: files.length,
  query: "",
  onQueryChange,
  fileId: new Map(files.map((file, i) => [file.newPath, `file-${i}`])),
  viewed: new Set(),
  commentCounts: new Map(),
};

const link = (name: RegExp) => screen.getByRole("link", { name });

describe("FileNav", () => {
  test("does show folders and files when in tree view", async () => {
    const user = userEvent.setup();
    render(<FileNav {...defaultProps} />);
    const src = screen.getByRole("button", { name: "src" });
    expect(src).toHaveAttribute("aria-expanded", "true");
    expect(link(/server\.ts/)).toHaveAttribute("href", "#file-3");

    await user.click(src);
    expect(src).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: /server\.ts/ })).not.toBeInTheDocument();
    expect(link(/notes\.md/)).toBeInTheDocument();
  });

  test("does show directories next to names and remember the choice in list view", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<FileNav {...defaultProps} />);
    await user.click(screen.getByRole("button", { name: "List view" }));

    expect(screen.queryByRole("button", { name: "src" })).not.toBeInTheDocument();
    expect(within(link(/new\.ts/)).getByText("src/util")).toBeInTheDocument();
    unmount();

    render(<FileNav {...defaultProps} />);
    expect(screen.getByRole("button", { name: "List view" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("does report the query only after typing stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FileNav {...defaultProps} />);
    await user.type(screen.getByLabelText("Filter files"), "serv");
    expect(onQueryChange).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(onQueryChange.mock.calls).toEqual([["serv"]]);
  });

  test("does clear immediately when pressing Escape", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<FileNav {...defaultProps} />);
    const input = screen.getByLabelText("Filter files");
    await user.type(input, "x");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
    expect(onQueryChange.mock.calls).toEqual([[""]]);

    act(() => vi.advanceTimersByTime(DEBOUNCE_MS));
    expect(onQueryChange.mock.calls).toEqual([[""]]);
  });

  test("does clear immediately when clicking the clear button", async () => {
    const user = userEvent.setup();
    render(<FileNav {...defaultProps} />);
    const input = screen.getByLabelText("Filter files");
    await user.type(input, "x");
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
    expect(onQueryChange).toHaveBeenLastCalledWith("");
  });

  test("does reset the input when the parent clears the query", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<FileNav {...defaultProps} />);
    const input = screen.getByLabelText("Filter files");
    await user.type(input, "zzz");
    rerender(<FileNav {...defaultProps} query="zzz" />);
    rerender(<FileNav {...defaultProps} query="" />);
    expect(input).toHaveValue("");
  });

  test("does focus the filter when pressing / outside an input", async () => {
    const user = userEvent.setup();
    render(
      <>
        <textarea aria-label="Other" />
        <FileNav {...defaultProps} />
      </>,
    );
    await user.keyboard("/");
    const input = screen.getByLabelText("Filter files");
    expect(input).toHaveFocus();
    expect(input).toHaveValue("");

    await user.click(screen.getByRole("textbox", { name: "Other" }));
    await user.keyboard("/");
    expect(screen.getByRole("textbox", { name: "Other" })).toHaveValue("/");
  });

  test("does show match counts while filtering", async () => {
    const user = userEvent.setup();
    render(<FileNav {...defaultProps} files={files.slice(0, 1)} />);
    await user.type(screen.getByLabelText("Filter files"), "notes");
    expect(screen.getByText(`1/${files.length}`)).toBeInTheDocument();
  });

  test("does show viewed ticks and comment counts on files", () => {
    render(
      <FileNav
        {...defaultProps}
        viewed={new Set(["src/server.ts"])}
        commentCounts={
          new Map([
            ["src/server.ts", 2],
            ["docs/notes.md", 1],
          ])
        }
      />,
    );
    expect(within(link(/server\.ts/)).getByText("Viewed")).toBeInTheDocument();
    expect(within(link(/server\.ts/)).getByLabelText("2 comments")).toBeInTheDocument();
    expect(within(link(/notes\.md/)).getByLabelText("1 comment")).toBeInTheDocument();
    expect(within(link(/notes\.md/)).queryByText("Viewed")).not.toBeInTheDocument();
  });

  test("does say so when no files match", () => {
    render(<FileNav {...defaultProps} tree={[]} files={[]} />);
    expect(screen.getByText("No matching files")).toBeInTheDocument();
  });
});
