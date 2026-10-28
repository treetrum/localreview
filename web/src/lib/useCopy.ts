import { useCallback, useEffect, useRef, useState } from "react";

const COPIED_MS = 2000;

/** Copies text to the clipboard and reports `copied` for a moment afterwards. */
export function useCopy(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch (err) {
      window.alert(`Couldn't copy to the clipboard: ${String(err)}`);
    }
  }, []);

  return [copied, copy];
}
