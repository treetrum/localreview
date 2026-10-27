import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Checkbox.module.css";

export function Checkbox({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return <input type="checkbox" className={cx(styles.checkbox, className)} {...props} />;
}
