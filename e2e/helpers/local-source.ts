import { expect, type Locator, type Page } from "@playwright/test";

export const DEEP_MARKER = "FIXTURE_DEEP_MARKER";
export const SECRET_MARKER = "FIXTURE_SECRET_MARKER";

export interface FixtureFile {
  path: string;
  text?: string;
  base64?: string;
}

/** A source file whose `commitCanvas` starts well beyond character 6,000. */
export function deepPersistSource() {
  const header = Array.from(
    { length: 120 },
    (_, index) => `// persistence helper note ${index}: keeps the canvas consistent`
  );
  const body = [
    "export function commitCanvas(canvas: unknown) {",
    `  const marker = "${DEEP_MARKER}";`,
    "  return { canvas, marker };",
    "}",
  ];
  return {
    text: `${[...header, ...body, "export const LAST = 1;"].join("\n")}\n`,
    commitStartLine: header.length + 1,
    markerLine: header.length + 2,
    commitEndLine: header.length + body.length,
  };
}

export function fixtureFiles(): FixtureFile[] {
  return [
    { path: "package.json", text: '{"name":"fixture","version":"1.0.0"}' },
    { path: "tsconfig.json", text: '{"compilerOptions":{"paths":{"@/*":["./src/*"]}}}' },
    { path: "src/lib/persist.ts", text: deepPersistSource().text },
    {
      path: "src/app/editor.tsx",
      text: 'import { commitCanvas } from "@/lib/persist";\nexport const run = () => commitCanvas({});\n',
    },
    { path: "api/Store.php", text: "<?php\nnamespace App;\nclass Store {}\n" },
    { path: "composer.json", text: '{"autoload":{"psr-4":{"App\\\\":"api/"}}}' },
    { path: "worker/tasks.py", text: "from .store import save\n" },
    { path: "worker/store.py", text: "def save():\n    pass\n" },
    { path: "engine/Cargo.toml", text: '[package]\nname = "engine"\n' },
    { path: "engine/src/lib.rs", text: "mod store;\n" },
    { path: "engine/src/store.rs", text: "pub fn save() {}\n" },
    { path: "README.md", text: "# Fixture\n" },
    { path: ".env", text: `TOKEN=${SECRET_MARKER}\n` },
    { path: "node_modules/leftpad/index.js", text: "module.exports = 1;\n" },
    {
      path: "assets/logo.png",
      base64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAfbLI3wAAAABJRU5ErkJggg==",
    },
  ];
}

/** Writes a fixture tree into the browser's private file system. The page must be on the app origin. */
export async function seedLocalFolder(page: Page, name: string, files: FixtureFile[]) {
  await page.evaluate(
    async ({ name, files }) => {
      const root = await navigator.storage.getDirectory();
      const base = await root.getDirectoryHandle(name, { create: true });
      for (const file of files) {
        const segments = file.path.split("/");
        const leaf = segments.pop()!;
        let directory = base;
        for (const segment of segments) {
          directory = await directory.getDirectoryHandle(segment, { create: true });
        }
        const handle = await directory.getFileHandle(leaf, { create: true });
        const writable = await handle.createWritable();
        await writable.write(
          file.base64
            ? Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0))
            : (file.text ?? "")
        );
        await writable.close();
      }
    },
    { name, files }
  );
}

/** Makes the folder picker return the seeded folder, as a user's choice would. */
export async function routePickerToSeededFolder(page: Page, name: string) {
  await page.addInitScript((folder) => {
    window.showDirectoryPicker = async () =>
      (await navigator.storage.getDirectory()).getDirectoryHandle(folder);
  }, name);
}

/** Seeds a folder and opens its review dialog without generating a map. */
export async function openLocalReviewDialog(
  page: Page,
  { name = "fixture", files = fixtureFiles() }: { name?: string; files?: FixtureFile[] } = {}
): Promise<Locator> {
  await page.goto("/");
  await seedLocalFolder(page, name, files);
  await routePickerToSeededFolder(page, name);
  await page.goto("/project/new");
  await page.getByRole("button", { name: "Choose local folder" }).click();
  const dialog = page.getByTestId("source-review-dialog");
  await expect(dialog.getByRole("group", { name: "Folders" })).toBeVisible({ timeout: 30_000 });
  return dialog;
}

export function node(
  id: string,
  category: string,
  subtype: string,
  name: string,
  evidence?: string[]
) {
  return {
    id,
    category,
    subtype,
    name,
    technology: "TypeScript",
    description: `${name} description`,
    reasoning: "Inferred from the source",
    locked: false,
    ...(evidence ? { evidence } : {}),
  };
}
