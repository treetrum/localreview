import type { ReactNode } from "react";
import { cx } from "../../lib/cx";
import { useTooltip } from "./Tooltip";
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
        <ToggleItem
          key={option.value}
          option={option}
          pressed={option.value === value}
          onClick={() => onChange(option.value)}
        />
      ))}
    </fieldset>
  );
}

function ToggleItem<T extends string>({
  option,
  pressed,
  onClick,
}: {
  option: ToggleOption<T>;
  pressed: boolean;
  onClick: () => void;
}) {
  const { triggerProps, tooltip } = useTooltip(option.label);
  return (
    <>
      <button
        {...triggerProps}
        type="button"
        className={styles.item}
        aria-pressed={pressed}
        aria-label={option.label}
        onClick={onClick}
      >
        {option.icon}
      </button>
      {tooltip}
    </>
  );
}
