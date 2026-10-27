import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Button.module.css";

export type ButtonProps = ComponentProps<"button"> & {
  variant?: "default" | "outline" | "secondary" | "ghost" | "destructive";
  size?: "default" | "sm" | "xs" | "icon" | "icon-sm" | "icon-xs";
};

export function Button({
  variant = "default",
  size = "default",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], styles[`size-${size}`], className)}
      {...props}
    />
  );
}
