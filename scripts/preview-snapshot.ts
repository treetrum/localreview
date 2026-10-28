import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { argv, cwd } from "node:process";
import { loadDiff } from "../src/git";

// Writes a static /api/diff into dist/ so the built UI can be hosted without the server,
// for PR previews. Run after `bun run build`, which empties dist/.
const base = argv[2];
const diff = await loadDiff(cwd(), { kind: "branch", base });
await mkdir(join("dist", "api"), { recursive: true });
await Bun.write(join("dist", "api", "diff"), JSON.stringify(diff));
console.log(`Wrote dist/api/diff: ${diff.label}, ${diff.files.length} files`);
