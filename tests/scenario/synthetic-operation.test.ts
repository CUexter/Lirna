import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../../src/api/create-api.js";
import { FileArtifactStore } from "../../src/artifacts/file-artifact-store.js";
import { migrate } from "../../src/database/migrate.js";
import { OperationRepository } from "../../src/operations/operation-repository.js";
import { SyntheticVaultAdapter } from "../../src/vault/synthetic-vault-adapter.js";
import { OperationWorker } from "../../src/worker/operation-worker.js";

describe("synthetic application operation", () => {
  let databaseUrl: string;
  let stopDatabase: () => Promise<void>;
  let temporaryRoot: string;

  async function startScenario(adapterRoot: string) {
    const operations = new OperationRepository(databaseUrl);
    const artifacts = new FileArtifactStore(
      join(temporaryRoot, adapterRoot, "artifacts"),
    );
    const vault = new SyntheticVaultAdapter(
      join(temporaryRoot, adapterRoot, "vault"),
    );
    const worker = new OperationWorker({ operations, artifacts, vault });
    const api = createApi({ operations, artifacts });
    const address = await api.listen();

    return {
      address,
      worker,
      close: async () => {
        await api.close();
        await operations.close();
      },
    };
  }

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const database = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = database.getConnectionUri();
      stopDatabase = () => database.stop().then(() => undefined);
    }
    temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-scenario-"));
  });

  afterAll(async () => {
    await stopDatabase?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("crosses the API, worker, PostgreSQL, and synthetic adapters", async () => {
    // The documented dev command starts both migration-capable processes together.
    await Promise.all([migrate(databaseUrl), migrate(databaseUrl)]);
    const scenario = await startScenario("http");

    try {
      const submittedResponse = await fetch(`${scenario.address}/api/operations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "synthetic-adapter-roundtrip",
          input: "A synthetic, non-sensitive fixture",
        }),
      });
      expect(submittedResponse.status).toBe(202);
      const submitted = (await submittedResponse.json()) as {
        id: string;
        status: string;
      };
      expect(submitted.status).toBe("queued");

      expect(await scenario.worker.runOnce()).toBe(true);

      const completedResponse = await fetch(
        `${scenario.address}/api/operations/${submitted.id}`,
      );
      expect(completedResponse.status).toBe(200);
      const completed = (await completedResponse.json()) as {
        id: string;
        status: string;
        result: { artifactUrl: string; vaultPath: string };
      };
      expect(completed).toMatchObject({
        id: submitted.id,
        status: "completed",
        result: {
          artifactUrl: `/api/operations/${submitted.id}/artifact`,
          vaultPath: `synthetic/${submitted.id}.md`,
        },
      });

      const artifactResponse = await fetch(
        `${scenario.address}${completed.result.artifactUrl}`,
      );
      expect(artifactResponse.status).toBe(200);
      expect(await artifactResponse.text()).toBe(
        "Synthetic operation result\n\nA synthetic, non-sensitive fixture\n",
      );
    } finally {
      await scenario.close();
    }
  });

  it("lets the installable PWA invoke and observe the public operation", async () => {
    await migrate(databaseUrl);
    const scenario = await startScenario("pwa");
    let workerRunning = true;
    const workerLoop = (async () => {
      while (workerRunning) {
        if (!(await scenario.worker.runOnce())) await delay(20);
      }
    })();
    const browser = await chromium.launch({
      executablePath: execFileSync("which", ["google-chrome"], {
        encoding: "utf8",
      }).trim(),
      headless: true,
    });

    try {
      const page = await browser.newPage();
      await page.goto(scenario.address);
      expect(await page.locator('link[rel="manifest"]').getAttribute("href")).toBe(
        "/manifest.webmanifest",
      );
      const manifestResponse = await page.request.get(
        `${scenario.address}/manifest.webmanifest`,
      );
      expect(await manifestResponse.json()).toMatchObject({
        name: "Lirna",
        display: "standalone",
      });
      expect(
        await page.evaluate(() =>
          navigator.serviceWorker.ready.then((registration) =>
            Boolean(registration.active),
          ),
        ),
      ).toBe(true);

      await page
        .getByLabel("Synthetic fixture")
        .fill("A fixture submitted by the PWA");
      await page.getByRole("button", { name: "Run operation" }).click();
      await page
        .getByRole("link", { name: "Open the stored synthetic artifact" })
        .waitFor();
      expect(await page.locator("[data-status]").textContent()).toBe("completed");
      expect(
        await page
          .getByRole("link", { name: "Open the stored synthetic artifact" })
          .getAttribute("href"),
      ).toMatch(
        /^\/api\/operations\/[0-9a-f-]+\/artifact$/,
      );
    } finally {
      await browser.close();
      workerRunning = false;
      await workerLoop;
      await scenario.close();
    }
  });
});
