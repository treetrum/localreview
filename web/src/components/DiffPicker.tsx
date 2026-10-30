import { useId, type MouseEvent, type ReactNode } from "react";
import type { DiffResponse, DiffTarget } from "../../../shared/types";
import { clickCommit, selectedRange } from "../lib/commits";
import { ChevronDown } from "./icons";
import { usePopover } from "./ui/Popover";
import styles from "./DiffPicker.module.css";

export type DiffPickerProps = {
  diff: DiffResponse;
  onTargetChange: (target: DiffTarget) => void;
  /** Picking a base also switches to the branch diff. */
  onBaseChange: (base: string) => void;
};

export function DiffPicker({ diff, onTargetChange, onBaseChange }: DiffPickerProps) {
  const { triggerProps, render, setOpen } = usePopover("Choose what to review");
  const { target, base, commits } = diff;
  const on = diff.branch ?? "HEAD";
  const range = selectedRange(commits, target);

  const pick = (next: DiffTarget) => {
    setOpen(false);
    onTargetChange(next);
  };
  const pickCommit = (sha: string, event: MouseEvent) =>
    pick(clickCommit(commits, target, sha, event.shiftKey));

  return (
    <>
      <button type="button" className={styles.trigger} {...triggerProps}>
        <span className={styles.label}>{diff.label}</span>
        <ChevronDown size={14} />
      </button>
      {render(
        <div className={styles.panel}>
          <div className={styles.section}>
            <label className={styles.base}>
              <span>Compare against</span>
              <select
                value={base ?? ""}
                onChange={(event) => {
                  setOpen(false);
                  onBaseChange(event.target.value);
                }}
              >
                {base === null && (
                  <option value="" disabled>
                    Choose a branch…
                  </option>
                )}
                {diff.branches.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <Option
              title={base === null ? `All changes on ${on}` : `${on} vs ${base}`}
              description="Committed, uncommitted and untracked changes since the merge-base"
              selected={target.kind === "branch"}
              disabled={base === null}
              onClick={() => pick({ kind: "branch" })}
            />
            <Option
              title="Uncommitted changes"
              description="Staged, unstaged and untracked changes since the last commit"
              selected={target.kind === "uncommitted"}
              onClick={() => pick({ kind: "uncommitted" })}
            />
            <Option
              title="Staged changes"
              description="Only what's staged for the next commit"
              selected={target.kind === "staged"}
              onClick={() => pick({ kind: "staged" })}
            />
          </div>
          {commits.length > 0 && (
            <div className={styles.commits}>
              <div className={styles.commitsHeader}>
                <h2>{diff.commitsScope === "branch" ? `Commits on ${on}` : "Recent commits"}</h2>
                <span>Shift-click to select a range</span>
              </div>
              <ul>
                {commits.map((commit, index) => (
                  <li key={commit.sha}>
                    <Option
                      title={commit.subject}
                      description={
                        <>
                          <code>{commit.sha.slice(0, 7)}</code> {commit.author} ·{" "}
                          <time dateTime={commit.date}>{commit.date.slice(0, 10)}</time>
                        </>
                      }
                      selected={range !== null && index >= range[0] && index <= range[1]}
                      onClick={(event) => pickCommit(commit.sha, event)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>,
      )}
    </>
  );
}

function Option({
  title,
  description,
  selected,
  disabled,
  onClick,
}: {
  title: string;
  description: ReactNode;
  selected: boolean;
  disabled?: boolean;
  onClick: (event: MouseEvent) => void;
}) {
  const id = useId();
  return (
    <button
      type="button"
      className={styles.option}
      aria-pressed={selected}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      disabled={disabled}
      data-autofocus={selected || undefined}
      onClick={onClick}
    >
      <span id={`${id}-title`} className={styles.optionTitle}>
        {title}
      </span>
      <span id={`${id}-description`} className={styles.optionDescription}>
        {description}
      </span>
    </button>
  );
}
