import {
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
  type Placement,
} from "@floating-ui/react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Tooltip.module.css";

export const TOOLTIP_DELAY_MS = 400;

/**
 * A hover/focus tooltip for a trigger that already has an accessible name. The tooltip repeats
 * that name visually, so it's hidden from assistive tech rather than wired up as a description.
 */
export function useTooltip(content: ReactNode, placement: Placement = "bottom") {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pressed = useRef(false);
  const {
    refs: { setReference, setFloating },
    floatingStyles,
  } = useFloating({
    open,
    placement,
    strategy: "fixed",
    middleware: [offset(6), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  const show = (delay: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(true), delay);
  };
  const hide = () => {
    clearTimeout(timer.current);
    setOpen(false);
  };

  const triggerProps = {
    ref: setReference,
    onMouseEnter: () => show(TOOLTIP_DELAY_MS),
    onMouseLeave: hide,
    // Only keyboard focus: a click focuses the button too, and the tooltip would then linger.
    onFocus: () => {
      if (!pressed.current) show(0);
    },
    onBlur: () => {
      pressed.current = false;
      hide();
    },
    onPointerDown: () => {
      pressed.current = true;
      hide();
    },
  };

  const tooltip = open
    ? createPortal(
        <div ref={setFloating} className={styles.tooltip} style={floatingStyles} aria-hidden>
          {content}
        </div>,
        document.body,
      )
    : null;

  return { triggerProps, tooltip };
}
