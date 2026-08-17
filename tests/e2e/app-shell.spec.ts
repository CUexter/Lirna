import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the Resume cockpit", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Lirna");
  await expect(
    page.getByRole("navigation", { name: "Workspace" }),
  ).toContainText("Now");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByText("Resume your thought")).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );

  expect(seriousViolations).toEqual([]);
});
