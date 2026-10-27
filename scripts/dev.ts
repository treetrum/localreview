import { cwd, env } from "node:process";

// Runs the Bun API (restarting on change) and the Vite dev server, which proxies /api to it.
const repo = env.LOCALREVIEW_REPO ?? cwd();

const children = [
  Bun.spawn(["bun", "--watch", "src/cli.ts", "--cwd", repo, "--port", "4173", "--no-open"], {
    stdio: ["inherit", "inherit", "inherit"],
  }),
  Bun.spawn(["bunx", "vite"], { stdio: ["inherit", "inherit", "inherit"] }),
];

const stopAll = () => {
  for (const child of children) child.kill();
};
process.on("SIGINT", stopAll);
process.on("SIGTERM", stopAll);

await Promise.race(children.map((child) => child.exited));
stopAll();
