import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Badge.module.css";

export type BadgeProps = ComponentProps<"span"> & {
  variant?: "default" | "secondary" | "outline";
};

export function Badge({ variant = "secondary", className, ...props }: BadgeProps) {
  return <span className={cx(styles.badge, styles[variant], className)} {...props} />;
}
