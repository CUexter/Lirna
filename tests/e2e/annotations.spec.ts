import { expect, test } from "@playwright/test";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const selectedText = "Visible typed paragraph.";

const probe = (expected: string) => {
  const sel = window.getSelection();
  const registry = (
    CSS as typeof CSS & {
      highlights?: Map<string, Iterable<Range>> | undefined;
    }
  ).highlights;
  let highlightCovers = false;
  if (registry) {
    for (const highlight of registry.values()) {
      try {
        for (const range of highlight) {
          if (range.toString() === expected) {
            highlightCovers = true;
            break;
          }
        }
      } catch {
        // Iterability varies across engines; keep scanning.
      }
      if (highlightCovers) break;
    }
  }
  return {
    nativeText: sel?.toString() ?? "",
    hasNative: !!sel && !sel.isCollapsed,
    highlightCovers,
  };
};

test("preserves the visual selection while composing an annotation note", async ({
  page,
}) => {
  await page.goto(`/sources/${sourceId}/${stateId}`);
  await expect(page.getByRole("heading", { name: "Knowledge" })).toBeVisible();

  await page.getByText(selectedText, { exact: true }).selectText();
  await expect(
    page.getByRole("dialog", { name: "Create annotation" }),
  ).toBeVisible();

  const before = await page.evaluate(probe, selectedText);
  expect(before.nativeText).toBe(selectedText);

  // Open the side panel (compact hover -> side panel) and focus the note field.
  await page
    .getByRole("button", { name: "Add note" })
    .evaluate((el) => el.click());
  await expect(page.getByLabel("Annotation note")).toBeVisible();
  await page.getByLabel("Annotation note").evaluate((el) => el.focus());

  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const active = document.activeElement;
          return active instanceof HTMLTextAreaElement ? active.value : null;
        }),
      { message: "note field is focused" },
    )
    .toBe("");

  const after = await page.evaluate(probe, selectedText);

  // Bug: the visual selection disappears when the note field is focused.
  // Fix: paint the live selection as a custom highlight so it stays visible.
  expect(after.highlightCovers).toBe(true);
});
