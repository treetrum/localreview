import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadDiff } from "../src/git";

// Writes a static /api/diff into dist/ so the built UI can be hosted without the server, for PR
// previews. The diff comes from a fixed demo repo so every preview shows the same review. Run
// after `bun run build`, which empties dist/.

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
const git = (...args: string[]) => {
  const result = Bun.spawnSync(["git", ...args], {
    cwd: root,
    stderr: "pipe",
    // Fixed dates keep commit SHAs identical across deploys.
    env: {
      ...process.env,
      GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
      GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
    },
  });
  if (result.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${result.stderr}`);
};
const write = (path: string, content: string) => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
};

try {
  git("init", "-q", "-b", "main");
  git("config", "user.email", "demo@example.com");
  git("config", "user.name", "Demo");
  git("config", "commit.gpgsign", "false");
  write("README.md", "# Acme Shop\n\nA tiny shopping cart.\n");
  write("src/cart.ts", cartBase);
  write("src/format.ts", formatBase);
  write("src/legacy.ts", "export const LEGACY_TAX_RATE = 0.1;\n");
  write("styles/cart.css", stylesBase);
  git("add", "-A");
  git("commit", "-q", "-m", "Initial cart");

  git("checkout", "-q", "-b", "feature/discounts");
  rmSync(join(root, "src/format.ts"));
  rmSync(join(root, "src/legacy.ts"));
  write("src/utils/format.ts", formatHead);
  write("src/cart.ts", cartHead);
  write("src/discounts.ts", discounts);
  write("styles/cart.css", stylesHead);
  git("add", "-A");
  git("commit", "-q", "-m", "Add discounts");

  // Left uncommitted and untracked, as an agent mid-task would.
  write("README.md", "# Acme Shop\n\nA tiny shopping cart with discount codes.\n");
  write("docs/discounts.md", "# Discounts\n\nPercent or fixed amounts, applied to the subtotal.\n");

  const diff = await loadDiff(root, { kind: "branch", base: "main" });
  // Review state is keyed by repoRoot, so a stable value keeps comments across redeploys.
  diff.repoRoot = "/demo/acme-shop";
  await mkdir(join("dist", "api"), { recursive: true });
  await Bun.write(join("dist", "api", "diff"), JSON.stringify(diff));
  console.log(`Wrote dist/api/diff: ${diff.label}, ${diff.files.length} files`);
} finally {
  rmSync(parent, { recursive: true, force: true });
}
