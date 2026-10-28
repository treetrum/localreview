import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { TOOLTIP_DELAY_MS, useTooltip } from "./Tooltip";

function Trigger() {
  const { triggerProps, tooltip } = useTooltip("Hide viewed files");
  return (
    <>
      <button {...triggerProps} type="button" aria-label="Hide viewed files" />
      {tooltip}
    </>
  );
}

const tip = () => screen.queryByText("Hide viewed files");

describe("useTooltip", () => {
  test("does show after a delay when hovering and hide when leaving", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Trigger />);
    const button = screen.getByRole("button", { name: "Hide viewed files" });

    await user.hover(button);
    expect(tip()).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    expect(tip()).toBeInTheDocument();

    await user.unhover(button);
    expect(tip()).not.toBeInTheDocument();
  });

  test("does show immediately when focused with the keyboard and hide on Escape", async () => {
    const user = userEvent.setup();
    render(<Trigger />);
    await user.tab();
    expect(await screen.findByText("Hide viewed files")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(tip()).not.toBeInTheDocument();
  });

  test("does hide when clicking the trigger", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<Trigger />);
    const button = screen.getByRole("button", { name: "Hide viewed files" });
    await user.hover(button);
    act(() => vi.advanceTimersByTime(TOOLTIP_DELAY_MS));
    await user.click(button);
    expect(tip()).not.toBeInTheDocument();
  });

  test("does keep the tooltip out of the accessibility tree", async () => {
    const user = userEvent.setup();
    render(<Trigger />);
    await user.tab();
    expect(await screen.findByText("Hide viewed files")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByRole("button")).toHaveAccessibleName("Hide viewed files");
  });
});
