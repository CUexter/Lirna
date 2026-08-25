import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("reviews, confirms, activates, and rolls back Reading Derivatives", async ({
  page,
}, testInfo) => {
  await page.setExtraHTTPHeaders({
    "x-e2e-session": `${testInfo.project.name}-${testInfo.retry}`,
  });
  await page.goto(
    "/sources/10000000-0000-4000-8000-000000000000/20000000-0000-4000-8000-000000000000",
  );
  const versions = page.getByRole("region", {
    name: "Reading Derivative versions",
  });
  await expect(versions.getByText(/Current version: 40000000/)).toBeVisible();
  await versions.getByRole("button", { name: "Generate candidate" }).click();
  await expect(versions.getByText("Candidate version 2")).toBeVisible();
  await expect(
    versions.getByText("Semantic and diagnostic comparison"),
  ).toBeVisible();
  await expect(
    versions.getByText(/annotation-visible: unresolved/),
  ).toBeVisible();
  await expect(versions.getByText(/original immutable evidence/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await versions.getByRole("button", { name: "Activate candidate" }).click();
  await expect(versions.getByText(/Current version: 60000000/)).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await versions
    .getByRole("button", { name: "Roll back to this version" })
    .first()
    .click();
  await expect(versions.getByText(/Current version: 40000000/)).toBeVisible();

  const accessibility = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    accessibility.violations.filter(({ impact }) =>
      impact ? ["serious", "critical"].includes(impact) : false,
    ),
  ).toEqual([]);
});
