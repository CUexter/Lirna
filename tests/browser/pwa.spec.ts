import { expect, test } from "@playwright/test";

test("the installable PWA works offline and completes an operation", async ({ page, context }) => {
  await page.goto("/");
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/manifest.webmanifest",
  );
  const manifest = await page.request.get("/manifest.webmanifest");
  await expect(manifest).toBeOK();
  expect(await manifest.json()).toMatchObject({ name: "Lirna", display: "standalone" });

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.evaluate(async () => {
    if (navigator.serviceWorker.controller) return;
    await new Promise<void>((resolve) => {
      navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true });
    });
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Trace the whole system." })).toBeVisible();
  await context.setOffline(false);

  await page.getByLabel("Synthetic fixture").fill("A fixture submitted by the PWA");
  await page.getByRole("button", { name: "Run operation" }).click();
  await expect(page.locator("[data-operation-status]")).toHaveText("completed");
  await expect(
    page.getByRole("link", { name: "Open the stored synthetic artifact" }),
  ).toHaveAttribute("href", /^\/api\/operations\/[0-9a-f-]+\/artifact$/);
});

test("Nathan can admit and inspect a text Source", async ({ page, request }) => {
  const denied = await request.post("/api/sources", {
    headers: { authorization: "Bearer synthetic-service-access-token-for-browser" },
    data: {
      title: "Service-selected publication",
      text: "This cannot be admitted.",
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    },
  });
  expect(denied.status()).toBe(403);

  await page.goto("/sources");
  for (const destination of ["Research", "Read", "Learn", "Sources", "Notes"]) {
    await expect(page.getByRole("link", { name: destination })).toBeVisible();
  }
  await page.getByLabel("Access token").fill("synthetic-human-access-token-for-browser");
  await page.getByLabel("Title").fill("A synthetic publication");
  await page.getByLabel("Publication text").fill("First line.\r\n\r\n   Second   line.  ");
  await page.getByLabel("Rights basis").selectOption("publicly-accessible");
  await page.getByRole("button", { name: "Admit Source" }).click();

  await expect(page.getByRole("heading", { name: "A synthetic publication" })).toBeVisible();
  await expect(page.locator("[data-normalized-text]")).toHaveText(
    "First line.\n\n   Second   line.  ",
  );
  await page.getByRole("button", { name: "View authoritative evidence" }).click();
  await expect(page.locator("[data-authoritative-evidence]")).toHaveText(
    "First line.\n\n   Second   line.  ",
  );
});
