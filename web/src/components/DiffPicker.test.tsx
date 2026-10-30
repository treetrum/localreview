import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { DiffTarget } from "../../../shared/types";
import { demoCommits, demoDiff } from "../test/fixtures";
import { DiffPicker, type DiffPickerProps } from "./DiffPicker";

const onTargetChange = vi.fn<(target: DiffTarget) => void>();
const onBaseChange = vi.fn<(base: string) => void>();
const defaultProps: DiffPickerProps = { diff: demoDiff, onTargetChange, onBaseChange };

const [, middle = "", oldest = ""] = demoCommits.map((commit) => commit.sha);

async function open(props: Partial<DiffPickerProps> = {}) {
  const user = userEvent.setup();
  render(<DiffPicker {...defaultProps} {...props} />);
  await user.click(screen.getByRole("button", { name: props.diff?.label ?? "feature vs main" }));
  return { user, dialog: within(screen.getByRole("dialog", { name: "Choose what to review" })) };
}

describe("DiffPicker", () => {
  test("does mark the current target and focus it when opened", async () => {
    const { dialog } = await open();
    const branch = dialog.getByRole("button", { name: "feature vs main" });
    expect(branch).toHaveAttribute("aria-pressed", "true");
    expect(branch).toHaveFocus();
    expect(dialog.getByRole("button", { name: "Staged changes" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  test("does report the target and close when an option is picked", async () => {
    const { user, dialog } = await open();
    await user.click(dialog.getByRole("button", { name: "Uncommitted changes" }));
    expect(onTargetChange).toHaveBeenCalledWith({ kind: "uncommitted" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  test("does report a single commit when one is clicked", async () => {
    const { user, dialog } = await open();
    await user.click(dialog.getByRole("button", { name: "Log the new message" }));
    expect(onTargetChange).toHaveBeenCalledWith({ kind: "commits", from: middle, to: middle });
  });

  test("does report a range when a commit is shift-clicked while one is selected", async () => {
    const { user, dialog } = await open({
      diff: {
        ...demoDiff,
        label: "b2b2b2b Log the new message",
        target: { kind: "commits", from: middle, to: middle },
      },
    });
    await user.keyboard("{Shift>}");
    await user.click(dialog.getByRole("button", { name: "Rename util/old to util/new" }));
    await user.keyboard("{/Shift}");
    expect(onTargetChange).toHaveBeenCalledWith({ kind: "commits", from: oldest, to: middle });
  });

  test("does mark every commit in the selected range", async () => {
    const { dialog } = await open({
      diff: {
        ...demoDiff,
        label: "a1a1a1a..b2b2b2b (2 commits)",
        target: { kind: "commits", from: oldest, to: middle },
      },
    });
    const pressed = (name: string) =>
      dialog.getByRole("button", { name }).getAttribute("aria-pressed");
    expect(pressed("Add a health check")).toBe("false");
    expect(pressed("Log the new message")).toBe("true");
    expect(pressed("Rename util/old to util/new")).toBe("true");
  });

  test("does report the base when a different branch is picked", async () => {
    const { user, dialog } = await open();
    await user.selectOptions(
      dialog.getByRole("combobox", { name: "Compare against" }),
      "origin/main",
    );
    expect(onBaseChange).toHaveBeenCalledWith("origin/main");
  });

  test("does disable the branch option when there is no base", async () => {
    const { dialog } = await open({
      diff: {
        ...demoDiff,
        label: "Uncommitted changes on feature",
        target: { kind: "uncommitted" },
        base: null,
      },
    });
    expect(dialog.getByRole("button", { name: "All changes on feature" })).toBeDisabled();
    expect(dialog.getByRole("combobox", { name: "Compare against" })).toHaveValue("");
  });

  test("does title the commit list recent commits when the branch has none of its own", async () => {
    const { dialog } = await open({ diff: { ...demoDiff, commitsScope: "recent" } });
    expect(dialog.getByRole("heading", { name: "Recent commits" })).toBeInTheDocument();
  });

  test("does close and refocus the trigger when Escape is pressed", async () => {
    const { user } = await open();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "feature vs main" })).toHaveFocus();
  });
});
