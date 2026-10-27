import type { FileStatus } from "../../../shared/types";
import { cx } from "../lib/cx";
import { Badge } from "./ui/Badge";
import styles from "./FileStatusBadge.module.css";

const LABELS: Record<FileStatus, string> = {
  added: "Added",
  deleted: "Deleted",
  modified: "Modified",
  renamed: "Renamed",
  untracked: "Untracked",
};

const LETTERS: Record<FileStatus, string> = {
  added: "A",
  deleted: "D",
  modified: "M",
  renamed: "R",
  untracked: "U",
};

export function FileStatusBadge({
  status,
  compact = false,
}: {
  status: FileStatus;
  compact?: boolean;
}) {
  return (
    <Badge
      className={cx(styles.badge, styles[status], compact && styles.compact)}
      title={LABELS[status]}
    >
      {compact ? LETTERS[status] : LABELS[status]}
    </Badge>
  );
}
