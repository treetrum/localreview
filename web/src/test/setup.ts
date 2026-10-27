import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => {
  cleanup();
  localStorage.clear();
  // A timed-out fake-timer test must not leak fake timers into later tests.
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
