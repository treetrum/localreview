import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { ResizeHandle, type ResizeHandleProps } from "./ResizeHandle";

const defaultProps: ResizeHandleProps = {
  label: "Resize file list",
  value: 300,
  min: 200,
  max: 500,
  defaultValue: 288,
  onChange: vi.fn(),
};

const handle = () => screen.getByRole("separator", { name: "Resize file list" });

describe("ResizeHandle", () => {
  test("does expose its width as the separator's value", () => {
    render(<ResizeHandle {...defaultProps} />);
    expect(handle()).toHaveAttribute("aria-valuenow", "300");
    expect(handle()).toHaveAttribute("aria-valuemin", "200");
    expect(handle()).toHaveAttribute("aria-valuemax", "500");
  });

  test("does resize by the drag distance when dragged", () => {
    const onChange = vi.fn();
    render(<ResizeHandle {...defaultProps} onChange={onChange} />);
    fireEvent.pointerDown(handle(), { button: 0, clientX: 300, pointerId: 1 });
    fireEvent.pointerMove(handle(), { clientX: 340, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(340);
    fireEvent.pointerMove(handle(), { clientX: 1000, pointerId: 1 });
    expect(onChange).toHaveBeenLastCalledWith(500);
    fireEvent.pointerUp(handle(), { pointerId: 1 });
    onChange.mockClear();
    fireEvent.pointerMove(handle(), { clientX: 250, pointerId: 1 });
    expect(onChange).not.toHaveBeenCalled();
  });

  test("does step and jump to the limits when using the keyboard", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ResizeHandle {...defaultProps} onChange={onChange} />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    expect(onChange).toHaveBeenLastCalledWith(316);
    await user.keyboard("{ArrowLeft}");
    expect(onChange).toHaveBeenLastCalledWith(284);
    await user.keyboard("{Home}");
    expect(onChange).toHaveBeenLastCalledWith(200);
    await user.keyboard("{End}");
    expect(onChange).toHaveBeenLastCalledWith(500);
  });

  test("does reset to the default width when double-clicked", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ResizeHandle {...defaultProps} onChange={onChange} />);
    await user.dblClick(handle());
    expect(onChange).toHaveBeenLastCalledWith(288);
  });
});
