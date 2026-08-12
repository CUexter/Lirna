import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { chromium } from "playwright-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi } from "../../server/api/create-api.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { ApplicationDatabase } from "../../server/database/database.js";
import { migrate } from "../../server/database/migrate.js";
import { DomainDatabase } from "../../server/domain/synthetic-domain.js";
import { OperationRepository } from "../../server/operations/operation-repository.js";
import { SyntheticVaultAdapter } from "../../server/vault/synthetic-vault-adapter.js";
import { OperationWorker } from "../../server/worker/operation-worker.js";
import type { WorkflowRunRepository } from "../../server/workflows/workflow-run-repository.js";
import { resetTestDatabase } from "../integration/database-test-support.js";

describe("synthetic application operation", () => {
  let databaseUrl: string;
  let database: ApplicationDatabase;
  let stopDatabase: () => Promise<void>;
  let temporaryRoot: string;

  async function startScenario(adapterRoot: string) {
    const operations = new OperationRepository(database.db);
    const artifacts = new FileArtifactStore(
      join(temporaryRoot, adapterRoot, "artifacts"),
    );
    const vault = new SyntheticVaultAdapter(
      join(temporaryRoot, adapterRoot, "vault"),
    );
    const domain = new DomainDatabase(database.db);
    const worker = new OperationWorker({ operations, artifacts, vault });
    const api = createApi({
      operations,
      artifacts,
      domain,
      workflows: {} as unknown as WorkflowRunRepository,
    });
    const address = await api.listen();

    return {
      address,
      worker,
      close: async () => {
        await api.close();
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
    await migrate(databaseUrl);
    database = new ApplicationDatabase(databaseUrl);
    await resetTestDatabase(database.db);
    temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-scenario-"));
  });

  afterAll(async () => {
    await database?.close();
    await stopDatabase?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("crosses the API, worker, PostgreSQL, and synthetic adapters", async () => {
    // Reapplying the same committed migration history is safe.
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
      await page.evaluate(async () => {
        if (navigator.serviceWorker.controller) return;
        await new Promise<void>((resolve) => {
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
            once: true,
          });
        });
      });

      await page.context().setOffline(true);
      await page.reload();
      expect(await page.getByRole("heading", { name: "Trace the whole system." }).isVisible()).toBe(true);
      await page.context().setOffline(false);

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

  it("keeps identity, history, and the outbox consistent, and refuses invalid writes", async () => {
    await migrate(databaseUrl);
    const scenario = await startScenario("domain");
    const recordId = randomUUID();

    async function revise(body: Record<string, unknown>): Promise<Response> {
      return fetch(`${scenario.address}/api/synthetic-records/${recordId}/revisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    }

    try {
      // Two successful, module-owned revisions of one stable identity.
      const created = await revise({
        module: "alpha",
        label: "first observation",
        note: "created",
        payload: { step: 1 },
      });
      expect(created.status).toBe(200);
      expect((await created.json()).revision).toBe(1);

      const revised = await revise({
        module: "alpha",
        label: "second observation",
        note: "revised",
        payload: { step: 2 },
      });
      expect(revised.status).toBe(200);

      const view = (await (
        await fetch(`${scenario.address}/api/synthetic-records/${recordId}`)
      ).json()) as {
        id: string;
        ownerModule: string;
        revision: number;
        state: { label: string; payload: Record<string, unknown> };
        history: Array<{ revision: number }>;
        events: Array<{ revision: number; eventType: string }>;
      };
      expect(view.id).toBe(recordId);
      expect(view.ownerModule).toBe("alpha");
      expect(view.revision).toBe(2);
      expect(view.state).toEqual({ label: "second observation", payload: { step: 2 } });
      // Immutable history and one outbox event per revision committed together.
      expect(view.history.map((entry) => entry.revision)).toEqual([1, 2]);
      expect(view.events.map((event) => event.revision)).toEqual([1, 2]);

      // A deliberately failed transaction: another module cannot write this
      // record, and nothing changes.
      const intrusion = await revise({
        module: "beta",
        label: "beta intrusion",
        note: "should be refused",
        payload: {},
      });
      expect(intrusion.status).toBe(409);

      // A deliberately failed transaction: the record invariant is violated.
      const invalid = await revise({
        module: "alpha",
        label: "",
        note: "invalid",
        payload: {},
      });
      expect(invalid.status).toBe(422);

      const afterFailures = (await (
        await fetch(`${scenario.address}/api/synthetic-records/${recordId}`)
      ).json()) as { revision: number; history: unknown[]; events: unknown[] };
      expect(afterFailures.revision).toBe(2);
      expect(afterFailures.history).toHaveLength(2);
      expect(afterFailures.events).toHaveLength(2);
    } finally {
      await scenario.close();
    }
  });
});
