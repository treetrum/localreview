import {
  autoUpdate,
  flip,
  offset,
  shift,
  size,
  useFloating,
  type Placement,
} from "@floating-ui/react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./Popover.module.css";

/**
 * A click-to-open dialog anchored to its trigger. Opening focuses the element marked
 * `data-autofocus`, or the first control. Escape closes it and refocuses the trigger; a pointer
 * press outside it just closes it.
 */
export function usePopover(label: string, placement: Placement = "bottom-start") {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  const panel = useRef<HTMLDialogElement | null>(null);
  const {
    refs: { setReference, setFloating },
    floatingStyles,
  } = useFloating({
    open,
    placement,
    strategy: "fixed",
    middleware: [
      offset(6),
      flip(),
      shift({ padding: 8 }),
      size({
        padding: 8,
        apply: ({ availableHeight, elements }) => {
          elements.floating.style.maxHeight = `${Math.max(availableHeight, 160)}px`;
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    if (!open) return;
    const node = panel.current;
    (
      node?.querySelector<HTMLElement>("[data-autofocus]") ??
      node?.querySelector<HTMLElement>("button:not(:disabled), select")
    )?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      trigger.current?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !trigger.current?.contains(target)) setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const triggerProps = {
    ref: (node: HTMLElement | null) => {
      trigger.current = node;
      setReference(node);
    },
    "aria-haspopup": "dialog" as const,
    "aria-expanded": open,
    onClick: () => setOpen((value) => !value),
  };

  const render = (content: ReactNode) =>
    open
      ? createPortal(
          <dialog
            open
            ref={(node) => {
              panel.current = node;
              setFloating(node);
            }}
            aria-label={label}
            className={styles.popover}
            style={floatingStyles}
          >
            {content}
          </dialog>,
          document.body,
        )
      : null;

  return { open, setOpen, triggerProps, render };
}
