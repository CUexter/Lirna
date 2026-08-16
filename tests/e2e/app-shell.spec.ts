import { expect, test } from "@playwright/test";

test("renders the application shell", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("lirna");
  await expect(page.getByRole("navigation")).toContainText("Home");
  await expect(page.getByRole("heading", { name: "API Status" })).toBeVisible();
});
