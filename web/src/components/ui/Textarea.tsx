import type { ComponentProps } from "react";
import { cx } from "../../lib/cx";
import styles from "./Textarea.module.css";

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(styles.textarea, className)} {...props} />;
}
