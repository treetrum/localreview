import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Input.module.css";

export function Input({ className, type = "text", ...props }: ComponentProps<"input">) {
  return <input type={type} className={cx(styles.input, className)} {...props} />;
}
