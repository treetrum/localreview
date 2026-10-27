import { useState } from "react";
import { rangeLabel, type ReviewComment } from "../lib/review";
import { Pencil, Trash } from "./icons";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Textarea } from "./ui/Textarea";
import styles from "./Comment.module.css";

export type CommentFormProps = {
  initialBody?: string;
  submitLabel?: string;
  placeholder?: string;
  onSubmit: (body: string) => void;
  onCancel: () => void;
};

export function CommentForm({
  initialBody = "",
  submitLabel = "Comment",
  placeholder = "Leave a comment",
  onSubmit,
  onCancel,
}: CommentFormProps) {
  const [body, setBody] = useState(initialBody);
  const blank = body.trim() === "";
  const submit = () => {
    if (!blank) onSubmit(body.trim());
  };

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <Textarea
        className={styles.textarea}
        aria-label="Comment"
        placeholder={placeholder}
        value={body}
        autoFocus
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            onCancel();
          }
        }}
      />
      <div className={styles.actions}>
        <span className={styles.hint}>⌘/Ctrl+↵ to submit · Esc to cancel</span>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={blank}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export type CommentCardProps = {
  comment: ReviewComment;
  outdated?: boolean;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
};

export function CommentCard({ comment, outdated = false, onUpdate, onDelete }: CommentCardProps) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <CommentForm
        initialBody={comment.body}
        submitLabel="Save"
        onSubmit={(body) => {
          onUpdate(comment.id, body);
          setEditing(false);
        }}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <article className={styles.card} aria-label="Comment">
      <header className={styles.header}>
        <span>{comment.range ? rangeLabel(comment.range) : "File comment"}</span>
        {outdated && <Badge className={styles.outdated}>Outdated</Badge>}
        <span className={styles.tools}>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Edit comment"
            title="Edit"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="Delete comment"
            title="Delete"
            onClick={() => onDelete(comment.id)}
          >
            <Trash size={14} />
          </Button>
        </span>
      </header>
      {outdated && comment.snippet.length > 0 && (
        <pre className={styles.snippet}>
          {comment.snippet
            .map(
              (line) =>
                (line.type === "add" ? "+" : line.type === "del" ? "-" : " ") + line.content,
            )
            .join("\n")}
        </pre>
      )}
      <p className={styles.body}>{comment.body}</p>
    </article>
  );
}
