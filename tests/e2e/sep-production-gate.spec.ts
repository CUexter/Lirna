import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  installNavigationTrace,
  navigationTrace,
  retainArticlePosition,
} from "./reading-navigation-helpers";
import {
  activateWithKeyboard,
  expectNoSeriousAccessibilityViolations,
  expectOrpcPayload,
  expectResponsiveWorkspace,
  hasRetainedCitationHighlight,
} from "./sep-production-gate-helpers";

const budgets = JSON.parse(
  readFileSync(
    new URL("../../config/sep-production-budgets.json", import.meta.url),
    "utf8",
  ),
).budgets as {
  apiPayloadBytes: number;
  initialWorkspaceLoadMilliseconds: number;
  componentTransitionMilliseconds: number;
  largestRetainedAssetBytes: number;
  offlineStartMilliseconds: number;
};

test.setTimeout(60_000);

test("completes the production SEP journey within accessibility and performance budgets", async ({
  page,
}, testInfo) => {
  await installNavigationTrace(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setExtraHTTPHeaders({
    "x-e2e-session": `production-${testInfo.project.name}-${testInfo.retry}`,
  });
  const requestUrls: string[] = [];
  page.on("request", (request) => requestUrls.push(request.url()));

  await page.goto("/sources/admission");
  const urlInput = page.getByLabel("SEP URL");
  await urlInput.fill("https://plato.stanford.edu/entries/epistemology/");
  await urlInput.focus();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Create preview" }),
  ).toBeFocused();
  const previewCreated = page.waitForResponse((response) =>
    response.url().includes("/orpc/sepAdmission/submit"),
  );
  await page.keyboard.press("Enter");
  expect((await previewCreated).ok()).toBe(true);
  await expect(page.getByText("Completeness: Complete")).toBeVisible();
  await expect(page.getByText("Reading readiness: Ready")).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.getByRole("checkbox", { name: /^Recommended archive/ }).check();
  await page
    .getByRole("checkbox", {
      name: /Create one immutable Source state for each selected observation/,
    })
    .check();
  await page.getByRole("button", { name: "Admit active and archive" }).click();
  await expect(page.getByText("Immutable states created")).toBeVisible();

  const initialStarted = performance.now();
  await page.getByRole("link", { name: /State 1: Active/ }).click();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  const initialWorkspaceLoadMilliseconds = performance.now() - initialStarted;
  expect(initialWorkspaceLoadMilliseconds).toBeLessThanOrEqual(
    budgets.initialWorkspaceLoadMilliseconds,
  );
  const apiPayloadBytes = await page.evaluate(() =>
    performance
      .getEntriesByType("resource")
      .filter((entry) => entry.name.includes("/orpc/"))
      .reduce(
        (total, entry) =>
          total + (entry as PerformanceResourceTiming).encodedBodySize,
        0,
      ),
  );
  expect(apiPayloadBytes).toBeGreaterThan(0);
  expect(apiPayloadBytes).toBeLessThanOrEqual(budgets.apiPayloadBytes);
  await expect(page.getByRole("article")).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Component contents" }),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "Reading tools" }),
  ).toBeVisible();
  await expectResponsiveWorkspace(
    page,
    testInfo.project.name.includes("mobile"),
  );
  const sourceInformation = page.getByLabel("State 1 evidence");
  await sourceInformation.getByText("Diagnostics and Derivatives").click();
  await expect(
    sourceInformation.getByText("partial; Reading degraded"),
  ).toBeVisible();
  await expect(
    sourceInformation.getByText(
      "One optional authored component is unavailable.",
    ),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);
  expect(
    await page.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  ).toBe(true);

  const assetBytes = await page
    .getByAltText("Retained semantic diagram")
    .evaluate((image) => {
      const payload = (image as HTMLImageElement).src.split(",")[1];
      return payload ? atob(payload).length : 0;
    });
  expect(assetBytes).toBeLessThanOrEqual(budgets.largestRetainedAssetBytes);

  const transitionStarted = performance.now();
  const noteLink = page.getByRole("link", { name: "Note one" });
  await activateWithKeyboard(page, noteLink);
  await expect(page.getByText("Typed Notes content.")).toBeVisible();
  await expect(page.locator("[data-reading-scroll-owner]")).toHaveAttribute(
    "data-reading-scroll-owner",
    "publisher-note",
  );
  await expect
    .poll(() => navigationTrace(page))
    .toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cause: "publisher-note-navigation",
          owner: "publisher-note",
          target: "component:active:/notes.html",
        }),
        expect.objectContaining({
          cause: "pending-fragment",
          owner: "publisher-note",
          target: "scene:active:/notes.html:fragment:1",
        }),
      ]),
    );
  const componentTransitionMilliseconds = performance.now() - transitionStarted;
  expect(componentTransitionMilliseconds).toBeLessThanOrEqual(
    budgets.componentTransitionMilliseconds,
  );
  const supplementLink = page.getByRole("link", { name: "Open supplement" });
  await activateWithKeyboard(page, supplementLink);
  await expect(page.getByText("Typed supplement one content.")).toBeVisible();
  await page.goto(
    "/sources/10000000-0000-4000-8000-000000000000/20000000-0000-4000-8000-000000000000",
  );

  await page
    .getByText("Visible typed paragraph.", { exact: true })
    .selectText();
  const addNote = page.getByRole("button", { name: "Add note" });
  const annotationNote = page.getByLabel("Annotation note");
  await expect
    .poll(async () => {
      await addNote.evaluate((element) => element.click());
      return annotationNote.isVisible();
    })
    .toBe(true);
  await annotationNote.fill("Controlled production note.");
  await expect(annotationNote).toBeFocused();
  const annotationCreated = page.waitForResponse(
    (response) =>
      response.url().includes("/orpc/annotations/create") && response.ok(),
  );
  await page
    .getByRole("button", { name: "Highlight", exact: true })
    .evaluate((element) => element.click());
  const annotationResponse = await annotationCreated;
  await expectOrpcPayload(annotationResponse, {
    body: "Controlled production note.",
    componentIdentity: "active:/",
    exactText: "Visible typed paragraph.",
    kind: "note",
  });
  await expect(
    page.getByText("Reading position synced for Article"),
  ).toBeVisible();
  const resumeSaved = page.waitForRequest(
    (request) =>
      request.url().includes("/orpc/sources/resume/save") &&
      request.postData()?.includes('"scrollTop":240') === true,
  );
  await retainArticlePosition(page, 240);
  const resumeRequest = await resumeSaved;
  expect(resumeRequest.postData()).toContain('"scrollTop":240');
  expect(resumeRequest.postData()).toContain('"semanticLocation"');
  expect(resumeRequest.postData()).toContain(
    '"strategy":"content-fingerprint"',
  );
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(0);
  await expect
    .poll(async () =>
      (await navigationTrace(page)).some(
        ({ cause, owner }) => cause === "resume" && owner === "article",
      ),
    )
    .toBe(true);
  const notesTab = page
    .getByRole("complementary", { name: "Reading tools" })
    .getByRole("tab", { name: "Notes" });
  await activateWithKeyboard(page, notesTab);
  await expect(
    page.getByText("Return to visible paragraph.", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Controlled production note.").first(),
  ).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  const citationButton = page.getByRole("button", {
    name: "Citation: (Smith, 2024) (ambiguous)",
  });
  await activateWithKeyboard(page, citationButton);
  await expect(
    page.getByRole("heading", { name: "Resolve “(Smith, 2024)”" }),
  ).toBeVisible();
  expect(
    requestUrls.some((url) => url.includes("citationResolutions/infer")),
  ).toBe(false);
  const citationCreated = page.waitForResponse(
    (response) =>
      response.url().includes("/orpc/citationResolutions/create") &&
      response.ok(),
  );
  const candidateButton = page
    .getByRole("button", { name: "Select this candidate manually" })
    .first();
  await activateWithKeyboard(page, candidateButton);
  const citationResponse = await citationCreated;
  await expectOrpcPayload(citationResponse, {
    bibliographyComponentIdentity: "active:/",
    bibliographyEntryId: "smith-a",
    componentIdentity: "active:/",
    mentionId: "citation-mention-ambiguous",
    method: "manual",
  });
  await expect(
    page.getByRole("button", { name: "Manually selected" }),
  ).toBeDisabled();
  await expectNoSeriousAccessibilityViolations(page);

  await sourceInformation
    .getByRole("button", { name: "Check for update" })
    .click();
  await expect(sourceInformation.getByText("Active: unchanged")).toBeVisible();
  const versions = page.getByRole("region", {
    name: "Reading Derivative versions",
  });
  await versions.getByRole("button", { name: "Generate candidate" }).click();
  await expect(versions.getByText("Candidate version 2")).toBeVisible();
  const activated = page.waitForResponse((response) =>
    response.url().includes("/orpc/sources/derivatives/activate"),
  );
  const workspaceRefreshed = page.waitForResponse((response) =>
    response.url().includes("/orpc/sources/readingWorkspace"),
  );
  page.once("dialog", (dialog) => dialog.accept());
  await versions.getByRole("button", { name: "Activate candidate" }).click();
  expect(await (await activated).text()).toContain("60000000");
  expect(await (await workspaceRefreshed).text()).toContain(
    '"currentActivation":{"id":"70000000',
  );
  await expect(versions.getByText(/Current version: 60000000/)).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await versions
    .getByRole("button", { name: "Roll back to this version" })
    .first()
    .click();
  await expect(versions.getByText(/Current version: 40000000/)).toBeVisible();

  const retainButton = page.getByRole("button", {
    name: "Retain for offline reading",
  });
  await activateWithKeyboard(page, retainButton);
  await expect(page.getByText("Ready for offline reading")).toBeVisible();
  await page.route("**/orpc/**", (route) => route.abort("connectionfailed"));
  const offlineStarted = performance.now();
  await page.reload();
  await expect(
    page.getByText(/Backend unavailable.*verified replica/),
  ).toBeVisible();
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect
    .poll(() => hasRetainedCitationHighlight(page, "(Smith, 2024)"))
    .toBe(true);
  const offlineStartMilliseconds = performance.now() - offlineStarted;
  expect(offlineStartMilliseconds).toBeLessThanOrEqual(
    budgets.offlineStartMilliseconds,
  );

  await expectNoSeriousAccessibilityViolations(page);
  console.info(
    `SEP browser measurements (${testInfo.project.name})`,
    JSON.stringify({
      apiPayloadBytes,
      initialWorkspaceLoadMilliseconds: Math.round(
        initialWorkspaceLoadMilliseconds,
      ),
      componentTransitionMilliseconds: Math.round(
        componentTransitionMilliseconds,
      ),
      largestRetainedAssetBytes: assetBytes,
      offlineStartMilliseconds: Math.round(offlineStartMilliseconds),
    }),
  );
});
