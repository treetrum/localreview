import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Progress.module.css";

export function Progress({ className, ...props }: ComponentProps<"progress">) {
  return <progress className={cx(styles.progress, className)} {...props} />;
}
