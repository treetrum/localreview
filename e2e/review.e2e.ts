import { expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const section = (page: Page, path: string) => page.getByRole("region", { name: path });
const nav = (page: Page) => page.getByRole("navigation", { name: "Files" });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /localreview-e2e-/ })).toBeVisible();
});

test("lists committed, uncommitted and untracked changes against main", async ({ page }) => {
  await expect(page.getByText("feature vs main")).toBeVisible();
  await expect(nav(page).getByRole("link")).toHaveText([
    /todo\.txt/,
    /app\.ts/,
    /long\.ts/,
    /README\.md/,
  ]);
  await expect(page.getByText("0/4 viewed")).toBeVisible();
  await expect(section(page, "src/app.ts").getByText("const greeting")).toBeVisible();
  await expect(section(page, "README.md").getByText("Uncommitted line.")).toBeVisible();
  await expect(section(page, "notes/todo.txt").getByText("Untracked")).toBeVisible();
});

test("copies drag-selected and deleted-line comments as exact Markdown", async ({ page }) => {
  const app = section(page, "src/app.ts");

  const plus = app.getByRole("button", { name: "Comment on line 2", exact: true });
  await plus.hover();
  const from = await plus.boundingBox();
  const to = await app.getByRole("row").filter({ hasText: "return greeting;" }).boundingBox();
  if (!from || !to) throw new Error("rows not laid out");
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 5 });
  await page.mouse.up();
  await app.getByRole("textbox", { name: "Comment" }).fill("Use a template");
  await app.getByRole("button", { name: "Comment", exact: true }).click();

  await app.getByRole("button", { name: "Comment on deleted line 2" }).click();
  await app.getByRole("textbox", { name: "Comment" }).fill("Old style");
  await app.getByRole("textbox", { name: "Comment" }).press("ControlOrMeta+Enter");

  await page.getByRole("button", { name: "Copy review" }).click();
  await expect(page.getByRole("button", { name: "Copied" })).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toBe(`# Code review: feature vs main

Please address the following review feedback. Line numbers refer to the new version of each file unless marked as deleted.

## \`src/app.ts\`

### Line 2 (deleted)

\`\`\`diff
-  return "Hello, " + name;
\`\`\`

Old style

### Lines 2–3

\`\`\`diff
+  const greeting = \`Hello, \${name}!\`;
+  return greeting;
\`\`\`

Use a template
`);
});

test("scrolls a file into view when its sidebar link is clicked", async ({ page }) => {
  const readme = section(page, "README.md");
  await expect(readme).not.toBeInViewport();
  await nav(page)
    .getByRole("link", { name: /README\.md/ })
    .click();
  await expect(readme).toBeInViewport();
  await expect(page).toHaveURL(/#file-3$/);
});

test("keeps comments and viewed state after a reload", async ({ page }) => {
  const readme = section(page, "README.md");
  await readme.getByRole("button", { name: "Comment on file" }).click();
  await readme.getByRole("textbox", { name: "Comment" }).fill("Mention the setup");
  await readme.getByRole("button", { name: "Comment", exact: true }).click();
  const todo = section(page, "notes/todo.txt");
  await todo.getByRole("checkbox", { name: "Viewed" }).check();

  await page.reload();
  await expect(section(page, "README.md").getByText("Mention the setup")).toBeVisible();
  await expect(
    section(page, "notes/todo.txt").getByRole("checkbox", { name: "Viewed" }),
  ).toBeChecked();
  await expect(page.getByText("1/4 viewed")).toBeVisible();
});

test("un-marks a viewed file when it changes on disk and the diff is refreshed", async ({
  page,
  repo,
}) => {
  const readme = section(page, "README.md");
  const todo = section(page, "notes/todo.txt");
  await readme.getByRole("checkbox", { name: "Viewed" }).check();
  await todo.getByRole("checkbox", { name: "Viewed" }).check();
  await expect(page.getByText("2/4 viewed")).toBeVisible();

  repo.write("README.md", "# Demo\n\nChanged again.\n");
  await page.getByRole("button", { name: "Refresh" }).click();

  await expect(readme.getByText("Changed again.")).toBeVisible();
  await expect(readme.getByRole("checkbox", { name: "Viewed" })).not.toBeChecked();
  await expect(todo.getByRole("checkbox", { name: "Viewed" })).toBeChecked();
  await expect(page.getByText("1/4 viewed")).toBeVisible();
});
