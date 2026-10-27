import { useCallback, useState } from "react";

export function useLocalStorage<T>(
  key: string,
  fallback: T,
  isValid: (value: unknown) => value is T,
): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed: unknown = raw === null ? null : JSON.parse(raw);
      return isValid(parsed) ? parsed : fallback;
    } catch {
      return fallback;
    }
  });

  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Ignore: the preference just won't persist.
      }
    },
    [key],
  );

  return [value, update];
}
