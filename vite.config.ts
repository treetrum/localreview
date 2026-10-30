import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  root: fromRoot("./web"),
  plugins: [react()],
  build: {
    outDir: fromRoot("./dist"),
    emptyOutDir: true,
    // Shiki grammars are lazy-loaded chunks, some of them large.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: { "/api": "http://127.0.0.1:4173" },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "web",
          environment: "happy-dom",
          include: ["src/**/*.test.{ts,tsx}"],
          setupFiles: [fromRoot("./web/src/test/setup.ts")],
          clearMocks: true,
          // Reuses one happy-dom per worker instead of one per file (~30% faster). Safe because
          // setup.ts resets the DOM, storage, timers and stubbed globals after every test.
          isolate: false,
        },
      },
      {
        // Runs under Bun (`bun --bun vitest`) because src/ uses Bun APIs.
        root: fromRoot("."),
        test: {
          name: "server",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
    ],
  },
});
