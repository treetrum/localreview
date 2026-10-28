import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import type { DiffResponse } from "../../shared/types";
import { parseDiff } from "../../src/parse-diff";
import { demoDiff, demoDiffText, demoFiles } from "./test/fixtures";
import { renderApp } from "./test/renderApp";

const section = (path: string) => screen.getByRole("region", { name: path });
const navLink = (name: RegExp) =>
  within(screen.getByRole("navigation", { name: "Files" })).getByRole("link", { name });

async function ready() {
  await screen.findByRole("heading", { name: "demo" });
}

describe("App", () => {
  test("does show the error and retry when loading fails", async () => {
    const { user, respond } = renderApp({ status: 500, body: { error: "fatal: bad revision" } });
    expect(await screen.findByText("fatal: bad revision")).toBeInTheDocument();

    respond({ status: 200, body: demoDiff });
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await ready();
  });

  test("does say so when there are no changes", async () => {
    renderApp({ status: 200, body: { ...demoDiff, files: [] } });
    expect(await screen.findByText("No changes for feature vs main.")).toBeInTheDocument();
    expect(screen.getByText("0/0 viewed")).toBeInTheDocument();
  });

  test("does update progress and the sidebar when a file is marked viewed", async () => {
    const { user } = renderApp();
    await ready();
    expect(screen.getByText("0/4 viewed")).toBeInTheDocument();

    await user.click(within(section("src/server.ts")).getByRole("checkbox", { name: "Viewed" }));
    expect(screen.getByText("1/4 viewed")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Review progress" })).toHaveAttribute(
      "value",
      "1",
    );
    expect(within(navLink(/server\.ts/)).getByText("Viewed")).toBeInTheDocument();
  });

  test("does un-mark only changed files when refreshing", async () => {
    const { user, respond } = renderApp();
    await ready();
    await user.click(within(section("src/server.ts")).getByRole("checkbox", { name: "Viewed" }));
    await user.click(within(section("src/util/new.ts")).getByRole("checkbox", { name: "Viewed" }));
    expect(screen.getByText("2/4 viewed")).toBeInTheDocument();

    const changed: DiffResponse = {
      ...demoDiff,
      files: [
        ...parseDiff(demoDiffText.replace('+  console.log("new");', '+  console.log("newer");')),
        ...demoFiles.slice(-1),
      ],
    };
    respond({ status: 200, body: changed });
    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(await screen.findByText("1/4 viewed")).toBeInTheDocument();
    expect(
      within(section("src/server.ts")).getByRole("checkbox", { name: "Viewed" }),
    ).not.toBeChecked();
    expect(within(section("src/server.ts")).getByRole("table")).toBeInTheDocument();
    expect(
      within(section("src/util/new.ts")).getByRole("checkbox", { name: "Viewed" }),
    ).toBeChecked();
  });

  test("does keep unsaved drafts when filtering hides and shows a file", async () => {
    const { user } = renderApp();
    await ready();
    await user.click(
      within(section("src/server.ts")).getByRole("button", { name: "Comment on file" }),
    );
    await user.type(
      within(section("src/server.ts")).getByRole("textbox", { name: "Comment" }),
      "Draft",
    );

    await user.type(screen.getByLabelText("Filter files"), "notes");
    await waitFor(() => expect(screen.queryByRole("region", { name: "src/server.ts" })).toBeNull());
    expect(section("docs/notes.md")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /server\.ts/ })).toBeNull();

    await user.keyboard("{Escape}");
    expect(within(section("src/server.ts")).getByRole("textbox", { name: "Comment" })).toHaveValue(
      "Draft",
    );
  });

  test("does clear the filter from the empty diff", async () => {
    const { user } = renderApp();
    await ready();
    const input = screen.getByLabelText("Filter files");
    await user.type(input, "nothing-matches");
    await user.click(await screen.findByRole("button", { name: "Clear filter" }));

    expect(input).toHaveValue("");
    expect(section("src/server.ts")).toBeInTheDocument();
  });

  test("does hide viewed files from the sidebar and diff when hide viewed is on", async () => {
    const { user } = renderApp();
    await ready();
    await user.click(within(section("src/server.ts")).getByRole("checkbox", { name: "Viewed" }));
    await user.click(screen.getByRole("button", { name: "Hide viewed files" }));

    expect(screen.queryByRole("region", { name: "src/server.ts" })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Files" })).queryByRole("link", {
        name: /server\.ts/,
      }),
    ).not.toBeInTheDocument();
    expect(section("docs/notes.md")).toBeInTheDocument();
    expect(screen.getByText("1/4 viewed")).toBeInTheDocument();

    await user.click(within(section("docs/notes.md")).getByRole("checkbox", { name: "Viewed" }));
    expect(screen.queryByRole("region", { name: "docs/notes.md" })).not.toBeInTheDocument();
  });

  test("does show viewed files again from the empty diff", async () => {
    const { user } = renderApp();
    await ready();
    const markViewed = (path: string) =>
      user.click(within(section(path)).getByRole("checkbox", { name: "Viewed" }));
    await markViewed("src/server.ts");
    await markViewed("src/util/new.ts");
    await markViewed("docs/notes.md");
    await markViewed("scripts/setup.sh");
    await user.click(screen.getByRole("button", { name: "Hide viewed files" }));
    expect(screen.getByText("All files are viewed.")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show viewed files" }));
    expect(section("src/server.ts")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Hide viewed files" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("does copy all feedback as one Markdown document", async () => {
    const { user } = renderApp();
    await ready();
    const copy = screen.getByRole("button", { name: "Copy review" });
    expect(copy).toBeDisabled();

    await user.type(screen.getByLabelText("Overall feedback"), "Nice work.");
    const notes = section("docs/notes.md");
    await user.click(within(notes).getByRole("button", { name: "Comment on deleted line 1" }));
    await user.type(within(notes).getByRole("textbox", { name: "Comment" }), "Keep the title");
    await user.click(within(notes).getByRole("button", { name: "Comment" }));
    const server = section("src/server.ts");
    await user.click(within(server).getByRole("button", { name: "Comment on file" }));
    await user.type(within(server).getByRole("textbox", { name: "Comment" }), "Split this file");
    await user.click(within(server).getByRole("button", { name: "Comment" }));

    await user.click(copy);
    expect(screen.getByRole("button", { name: "Copied" })).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(`# Code review: feature vs main

Please address the following review feedback. Line numbers refer to the new version of each file unless marked as deleted.

## Overall

Nice work.

## \`docs/notes.md\`

### Line 1 (deleted)

\`\`\`diff
-# Notes
\`\`\`

Keep the title

## \`src/server.ts\`

Split this file
`);
  });

  test("does show comment counts in the sidebar", async () => {
    const { user } = renderApp();
    await ready();
    const server = section("src/server.ts");
    await user.click(within(server).getByRole("button", { name: "Comment on file" }));
    await user.type(within(server).getByRole("textbox", { name: "Comment" }), "One");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.click(within(server).getByRole("button", { name: "Comment on file" }));
    await user.type(within(server).getByRole("textbox", { name: "Comment" }), "Two");
    await user.keyboard("{Meta>}{Enter}{/Meta}");
    expect(within(navLink(/server\.ts/)).getByLabelText("2 comments")).toBeInTheDocument();
  });

  test("does clear feedback only after confirming", async () => {
    const confirm = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    vi.stubGlobal("confirm", confirm);
    const { user } = renderApp();
    await ready();
    const summary = screen.getByLabelText("Overall feedback");
    await user.type(summary, "Hmm");
    await user.click(within(section("src/server.ts")).getByRole("checkbox", { name: "Viewed" }));

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(summary).toHaveValue("Hmm");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(summary).toHaveValue("");
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByText("1/4 viewed")).toBeInTheDocument();
  });
});
