import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import styles from "./ToggleGroup.module.css";

export type ToggleOption<T extends string> = { value: T; label: string; icon: ReactNode };

export type ToggleGroupProps<T extends string> = {
  label: string;
  value: T;
  options: ToggleOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

export function ToggleGroup<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: ToggleGroupProps<T>) {
  return (
    <fieldset className={cx(styles.group, className)}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.item}
          aria-pressed={option.value === value}
          aria-label={option.label}
          title={option.label}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
        </button>
      ))}
    </fieldset>
  );
}
