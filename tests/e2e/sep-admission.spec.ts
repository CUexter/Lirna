import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("previews, extends, and deletes SEP Admission evidence", async ({
  page,
}) => {
  await page.goto("/sources/admission");

  const urlInput = page.getByLabel("SEP URL");
  await urlInput.fill("not a URL");
  await page.getByRole("button", { name: "Create preview" }).click();
  await expect(page.getByRole("alert")).toContainText("complete URL");

  await urlInput.fill("https://plato.stanford.edu/entries/rejected-entry/");
  await page.getByRole("button", { name: "Create preview" }).click();
  await expect(
    page.getByRole("button", { name: "Creating preview…" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("could not be captured");

  await urlInput.fill("https://plato.stanford.edu/entries/epistemology/");
  await page.getByRole("button", { name: "Create preview" }).click();
  await expect(
    page.getByRole("heading", {
      name: "The Stanford Encyclopedia of Philosophy entry on Epistemology",
    }),
  ).toBeVisible();
  await expect(page.getByText("Matthias Steup, Ram Neta")).toBeVisible();
  await expect(page.getByText("publicly-accessible")).toBeVisible();
  await expect(page.getByText("ordinary-cloud")).toBeVisible();
  await expect(page.getByText("18,420 byte", { exact: false })).toHaveCount(2);
  await expect(page.getByText("archive-recommended")).not.toBeVisible();
  await expect(
    page.getByText("SEP recommends a stable archived citation target."),
  ).toBeVisible();
  await expect(page.getByText("Aug 24, 2026", { exact: false })).toBeVisible();
  await expect(page.getByText("Completeness: Complete")).toBeVisible();
  await expect(page.getByText("Reading readiness: Ready")).toBeVisible();
  await expect(page.getByText("active:/", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Extend seven days" }).click();
  await expect(page.getByText("Aug 31, 2026", { exact: false })).toBeVisible();

  const accessibility = await new AxeBuilder({ page }).analyze();
  const seriousViolations = accessibility.violations.filter((violation) =>
    ["serious", "critical"].includes(violation.impact ?? ""),
  );
  expect(seriousViolations).toEqual([]);

  await page.getByRole("button", { name: "Delete preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Identity" }),
  ).not.toBeVisible();
  await expect(urlInput).toHaveValue("");
});

test("shows partial and stopped omissions and performs the one-time larger retry", async ({
  page,
}) => {
  await page.goto("/sources/admission");
  const urlInput = page.getByLabel("SEP URL");

  await urlInput.fill("https://plato.stanford.edu/entries/partial-entry/");
  await page.getByRole("button", { name: "Create preview" }).click();
  await expect(page.getByText("Completeness: Partial")).toBeVisible();
  await expect(page.getByText("Reading readiness: Degraded")).toBeVisible();
  await expect(page.getByText("capture returned HTTP 503")).toBeVisible();
  await expect(
    page.getByText("Limit reached", { exact: true }),
  ).not.toBeVisible();

  await urlInput.fill("https://plato.stanford.edu/entries/stopped-entry/");
  await page.getByRole("button", { name: "Create preview" }).click();
  await expect(page.getByText("Completeness: Stopped")).toBeVisible();
  await expect(page.getByText("Limit reached", { exact: true })).toBeVisible();
  await expect(page.getByText("Component limit reached")).toBeVisible();
  await expect(
    page.getByText(
      "The attempt is consumed when started; existing evidence remains unchanged if it fails.",
    ),
  ).toBeVisible();

  await page.getByRole("button", { name: "Use larger capture limits" }).click();
  await expect(
    page.getByRole("button", { name: "Retrying with larger limits…" }),
  ).toBeDisabled();
  await expect(page.getByText("Completeness: Complete")).toBeVisible();
  await expect(page.getByText("Expanded capture limits")).toBeVisible();
  await expect(
    page.getByText("The one-time larger capture retry has been used."),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Use larger capture limits" }),
  ).not.toBeVisible();
});

test("compares, confirms, admits, and opens selected Source states", async ({
  page,
}) => {
  await page.goto("/sources/admission");
  await page
    .getByLabel("SEP URL")
    .fill("https://plato.stanford.edu/entries/epistemology/");
  await page.getByRole("button", { name: "Create preview" }).click();

  await expect(
    page.getByText(
      "Active and recommended archive publication resources are materially distinct.",
    ),
  ).toBeVisible();
  const activeObservation = page.getByRole("checkbox", { name: /^Active/ });
  const archiveObservation = page.getByRole("checkbox", {
    name: /^Recommended archive/,
  });
  await expect(activeObservation).toBeChecked();
  await expect(archiveObservation).not.toBeChecked();
  const admitActive = page.getByRole("button", {
    name: "Admit active observation",
  });
  await expect(admitActive).toBeDisabled();

  await archiveObservation.check();
  await page
    .getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    })
    .check();
  const admitBoth = page.getByRole("button", {
    name: "Admit active and archive",
  });
  await admitBoth.click();
  await expect(
    page.getByRole("button", { name: "Admitting Source…" }),
  ).toBeDisabled();

  await expect(page.getByText("Immutable states created")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /State 1: Active/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /State 2: Recommended archive/ }),
  ).toBeVisible();
  await page.getByRole("link", { name: /State 1: Active/ }).click();
  await expect(
    page.getByRole("heading", { name: "Knowledge", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
});
