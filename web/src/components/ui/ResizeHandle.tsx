import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { cx } from "../../lib/cx";
import styles from "./ResizeHandle.module.css";

export type ResizeHandleProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  /** Width the handle resets to on double-click. */
  defaultValue: number;
  onChange: (value: number) => void;
  /** Which edge of the resized element the handle sits on. */
  edge?: "left" | "right";
  className?: string;
};

const STEP = 16;

/** A vertical separator on an element's edge that resizes it, by drag or arrow keys. */
export function ResizeHandle({
  label,
  value,
  min,
  max,
  defaultValue,
  onChange,
  edge = "right",
  className,
}: ResizeHandleProps) {
  // Moving a left edge leftwards widens the element.
  const direction = edge === "right" ? 1 : -1;
  const [drag, setDrag] = useState<{ x: number; width: number } | null>(null);
  const clamp = (width: number) => Math.round(Math.min(max, Math.max(min, width)));

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDrag({ x: event.clientX, width: value });
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag) onChange(clamp(drag.width + (event.clientX - drag.x) * direction));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = {
      ArrowLeft: value - STEP * direction,
      ArrowRight: value + STEP * direction,
      Home: min,
      End: max,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onChange(clamp(next));
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className={cx(styles.handle, styles[edge], drag && styles.dragging, className)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => setDrag(null)}
      onPointerCancel={() => setDrag(null)}
      onDoubleClick={() => onChange(clamp(defaultValue))}
      onKeyDown={onKeyDown}
    />
  );
}
