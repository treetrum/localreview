import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { toSearchParams, type DiffRequest, type DiffResponse } from "../shared/types";
import { loadDiff } from "../src/git";
import { snapshotPath } from "./preview-key";

// Writes a snapshot into dist/snapshots/ of every diff the picker can ask for, so the built UI can
// be hosted without the server, for PR previews (functions/api/diff.ts serves them). The diffs come
// from a fixed demo repo so every preview shows the same review. Run after `bun run build`, which
// empties dist/.

const cartBase = `import { formatPrice } from "./format";

export type Item = { id: string; name: string; price: number; quantity: number };

export class Cart {
  private items = new Map<string, Item>();

  add(item: Item) {
    const existing = this.items.get(item.id);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      this.items.set(item.id, { ...item });
    }
  }

  remove(id: string) {
    this.items.delete(id);
  }

  get size() {
    return this.items.size;
  }

  get isEmpty() {
    return this.items.size === 0;
  }

  list(): Item[] {
    return [...this.items.values()];
  }

  clear() {
    this.items.clear();
  }

  subtotal() {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.price * item.quantity;
    }
    return total;
  }

  summary() {
    return \`\${this.size} items, \${formatPrice(this.subtotal())}\`;
  }
}
`;

const cartHead = cartBase
  .replace(
    'import { formatPrice } from "./format";',
    'import { applyDiscount, type Discount } from "./discounts";\nimport { formatPrice } from "./utils/format";',
  )
  .replace(
    "  private items = new Map<string, Item>();",
    "  private items = new Map<string, Item>();\n  private discount: Discount | null = null;",
  )
  .replace(
    `  subtotal() {
    let total = 0;
    for (const item of this.items.values()) {
      total += item.price * item.quantity;
    }
    return total;
  }`,
    `  subtotal() {
    return this.list().reduce((total, item) => total + item.price * item.quantity, 0);
  }

  setDiscount(discount: Discount | null) {
    this.discount = discount;
  }

  total() {
    const subtotal = this.subtotal();
    return this.discount ? applyDiscount(subtotal, this.discount) : subtotal;
  }`,
  )
  .replace("formatPrice(this.subtotal())", "formatPrice(this.total())");

const formatBase = `export function formatPrice(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}

export function formatQuantity(quantity: number) {
  return quantity === 1 ? "1 item" : \`\${quantity} items\`;
}

export function formatPercent(value: number) {
  return \`\${value}%\`;
}
`;

const formatHead = formatBase.replace(
  `export function formatPrice(cents: number) {
  return "$" + (cents / 100).toFixed(2);
}`,
  `export function formatPrice(cents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}`,
);

const discounts = `export type Discount = { kind: "percent"; value: number } | { kind: "fixed"; value: number };

export function applyDiscount(subtotal: number, discount: Discount) {
  const off = discount.kind === "percent" ? Math.round((subtotal * discount.value) / 100) : discount.value;
  return Math.max(0, subtotal - off);
}
`;

const stylesBase = `.cart {
  display: grid;
  gap: 8px;
  padding: 16px;
}

.total {
  font-weight: 600;
}
`;

const stylesHead = `.cart {
  display: grid;
  gap: 12px;
  padding: 16px;
  border-radius: 8px;
}

.total {
  font-weight: 600;
}

.discount {
  color: var(--green-600);
}
`;

const parent = mkdtempSync(join(tmpdir(), "localreview-preview-"));
const root = join(parent, "acme-shop");
mkdirSync(root);
let day = 0;
const git = (...args: string[]) => {
  // Fixed dates keep commit SHAs identical across deploys.
  const date = `2026-01-${String(day).padStart(2, "0")}T09:00:00Z`;
  const result = Bun.spawnSync(["git", ...args], {
    cwd: root,
    stderr: "pipe",
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
};
const write = (path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};
const remove = (path: string) => rmSync(join(root, path));
const commit = (message: string) => {
  day++;
  git("add", "-A");
  git("commit", "-q", "-m", message);
};

const snapshots = new Set<string>();
async function snapshot(request: DiffRequest): Promise<DiffResponse | null> {
  const path = snapshotPath(toSearchParams(request));
  if (!path || snapshots.has(path)) return null;
  snapshots.add(path);
  const diff = await loadDiff(root, request);
  // Review state is keyed by repoRoot, so a stable value keeps comments across redeploys.
  diff.repoRoot = "/demo/acme-shop";
  await Bun.write(join("dist", path), JSON.stringify(diff));
  return diff;
}

try {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "demo@example.com");
  git("config", "user.name", "Demo");
  git("config", "commit.gpgsign", "false");
  write("README.md", "# Acme Shop\n\nA tiny shopping cart.\n");
  write("src/cart.ts", cartBase);
  write("src/format.ts", formatBase);
  write("styles/cart.css", stylesBase);
  commit("Initial cart");
  git("branch", "release/1.0");

  write("src/legacy.ts", "export const LEGACY_TAX_RATE = 0.1;\n");
  commit("Add the legacy tax rate");

  git("checkout", "-q", "-b", "feature/discounts");
  remove("src/format.ts");
  remove("src/legacy.ts");
  write("src/utils/format.ts", formatHead);
  commit("Move format helpers into utils");
  write("src/discounts.ts", discounts);
  commit("Add discount types");
  write("src/cart.ts", cartHead);
  commit("Apply discounts in the cart");
  write("styles/cart.css", stylesHead);
  commit("Polish the cart styles");

  // Left staged, unstaged and untracked, as an agent mid-task would.
  write("README.md", "# Acme Shop\n\nA tiny shopping cart with discount codes.\n");
  git("add", "README.md");
  write(
    "README.md",
    "# Acme Shop\n\nA tiny shopping cart with discount codes.\n\nSee docs/discounts.md.\n",
  );
  write(
    "src/discounts.ts",
    discounts.replace("export function", "// TODO: cap fixed discounts\nexport function"),
  );
  write("docs/discounts.md", "# Discounts\n\nPercent or fixed amounts, applied to the subtotal.\n");

  // Every request the picker can make: the default, then each base (or none, as in the default
  // URL) with each target and each commit range in that base's commit list.
  const initial = await snapshot({});
  await Promise.all(
    [undefined, ...(initial?.branches ?? [])].map(async (base) => {
      const commits = (await snapshot({ target: { kind: "branch" }, base }))?.commits ?? [];
      const ranges = commits.flatMap((to, newest) =>
        commits.slice(newest).map((from) => ({ from: from.sha, to: to.sha })),
      );
      await Promise.all([
        snapshot({ target: { kind: "uncommitted" }, base }),
        snapshot({ target: { kind: "staged" }, base }),
        ...ranges.map((range) => snapshot({ target: { kind: "commits", ...range }, base })),
      ]);
    }),
  );
  console.log(`Wrote ${snapshots.size} snapshots to dist/snapshots/`);
} finally {
  rmSync(parent, { recursive: true, force: true });
}
