import { expect, type Page, test } from "@playwright/test";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const readingUrl = `/sources/${sourceId}/${stateId}`;

test("preserves, retries, and reconciles offline reading progress", async ({
  context,
  page: initialPage,
}, testInfo) => {
  let page = initialPage;
  const session = `${testInfo.project.name}-${testInfo.retry}`;
  await context.setExtraHTTPHeaders({
    "x-e2e-session": `production-${session}`,
  });
  await page.goto(readingUrl);
  await expect(
    page.getByText(/Reading position synchronized for Article/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Retain for offline reading" })
    .click();
  await expect(
    page.getByText(/Save reading progress offline: supported/),
  ).toBeVisible();
  await context.setExtraHTTPHeaders({
    "x-e2e-session": `offline-progress-${session}`,
  });

  await context.setOffline(true);
  await page.getByRole("link", { name: "Same scene target" }).click();
  await expect(
    page.getByRole("heading", { name: "Notation" }),
  ).toBeInViewport();
  await page.waitForTimeout(800);
  await seedOfflineProgress(page, 640);
  await expect
    .poll(() => retainedProgress(page))
    .toMatchObject({
      pendingCount: 1,
    });
  await page.close();
  page = await context.newPage();
  await page.goto(readingUrl);
  await expect(page.getByText("Visible typed paragraph.")).toBeVisible();
  await expect
    .poll(() => retainedProgress(page))
    .toMatchObject({
      pendingCount: 1,
    });

  await context.setOffline(false);
  await page.reload();
  await expect(
    page.getByText(/Save reading progress offline: supported/),
  ).toBeVisible();
  const retry = page.getByRole("button", {
    name: "Retry progress synchronization",
  });
  const retryable = page.getByText(
    /Progress synchronization: (pending|failed)/,
  );
  await expect(retry).toBeVisible();
  await expect(retryable).toBeVisible();
  await retry.click();
  await expect
    .poll(() => retainedProgress(page))
    .toMatchObject({
      pendingCount: 0,
      synchronization: "synchronized",
    });

  await context.setOffline(true);
  await seedOfflineProgress(page, 0);
  await expect
    .poll(() => retainedProgress(page))
    .toMatchObject({
      pendingCount: 1,
    });
  await context.setOffline(false);
  await page.reload();
  await page.waitForTimeout(1200);
  await seedOfflineProgress(page, 0);
  await expect(retry).toBeVisible();
  await retry.click();
  await expect
    .poll(() => retainedProgress(page))
    .toMatchObject({
      pendingCount: 0,
      synchronization: "synchronized",
      scrollTop: 900,
      savedAt: "2099-08-29T12:00:00.000Z",
    });
});

async function seedOfflineProgress(page: Page, scrollTop: number) {
  await page.evaluate(
    async ({ scrollTop, sourceId, stateId }) => {
      type StoredPosition = {
        savedAt: string;
        scrollTop: number;
        semanticLocation: {
          fallback: { scrollTop: number };
          [key: string]: unknown;
        };
        [key: string]: unknown;
      };
      type StoredRecord = {
        manifest: { replicaBytes: number; replicaSha256: string };
        pendingProgress: unknown;
        replica: { positions: StoredPosition[]; [key: string]: unknown };
      };
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("lirna-offline-working-sets", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const key = `${sourceId}:${stateId}`;
      const record = await new Promise<StoredRecord>((resolve, reject) => {
        const request = database
          .transaction("working-sets", "readonly")
          .objectStore("working-sets")
          .get(key);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
      });
      const prior = record.replica.positions[0];
      if (!prior) throw new Error("Retained Reading has no saved position");
      const savedAt = new Date(
        Math.max(Date.now(), new Date(prior.savedAt).getTime() + 1),
      ).toISOString();
      const position = {
        ...prior,
        scrollTop,
        savedAt,
        semanticLocation: {
          ...prior.semanticLocation,
          fallback: { ...prior.semanticLocation.fallback, scrollTop },
        },
      };
      record.replica.positions = [position];
      record.pendingProgress = [{ position, synchronization: "pending" }];
      const serialized = JSON.stringify(record.replica);
      const bytes = new TextEncoder().encode(serialized);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      record.manifest.replicaBytes = bytes.byteLength;
      record.manifest.replicaSha256 = [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("working-sets", "readwrite");
        transaction.objectStore("working-sets").put(record, key);
        transaction.onerror = () => reject(transaction.error);
        transaction.oncomplete = () => resolve();
      });
      database.close();
      const lifecycle = new BroadcastChannel(
        "lirna-offline-working-set-lifecycle",
      );
      lifecycle.postMessage({ sourceId, stateId });
      lifecycle.close();
    },
    { scrollTop, sourceId, stateId },
  );
}

async function retainedProgress(page: Page) {
  return page.evaluate(
    ({ sourceId, stateId }) =>
      new Promise<{
        pendingCount: number;
        savedAt?: string;
        scrollTop?: number;
        synchronization: string;
      }>((resolve, reject) => {
        const request = indexedDB.open("lirna-offline-working-sets", 1);
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("working-sets", "readonly");
          const result = transaction
            .objectStore("working-sets")
            .get(`${sourceId}:${stateId}`);
          result.onerror = () => reject(result.error);
          result.onsuccess = () => {
            const record = result.result;
            const pending = record?.pendingProgress ?? [];
            const pendingPosition = pending[0]?.position;
            const position = record?.replica?.positions?.find(
              (candidate: { componentIdentity?: string }) =>
                candidate.componentIdentity ===
                (pendingPosition?.componentIdentity ?? "active:/"),
            );
            resolve({
              pendingCount: pending.length,
              savedAt: position?.savedAt,
              scrollTop: position?.scrollTop,
              synchronization: pending.some(
                (item: { synchronization?: string }) =>
                  item.synchronization === "failed",
              )
                ? "failed"
                : pending.length
                  ? "pending"
                  : "synchronized",
            });
          };
        };
      }),
    { sourceId, stateId },
  );
}
