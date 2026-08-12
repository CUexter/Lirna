import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApi, type ApiServer } from "../../server/api/create-api.js";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { ApplicationDatabase } from "../../server/database/database.js";
import { migrate } from "../../server/database/migrate.js";
import { DomainDatabase } from "../../server/domain/synthetic-domain.js";
import { OperationRepository } from "../../server/operations/operation-repository.js";
import { SourceLibrary } from "../../server/sources/source-library.js";
import type { WorkflowRunRepository } from "../../server/workflows/workflow-run-repository.js";
import { executeTestSql, resetTestDatabase } from "./database-test-support.js";

describe("Source admission", () => {
  let database: ApplicationDatabase;
  let stopDatabase: () => Promise<void>;
  let api: ApiServer;
  let address: string;

  beforeAll(async () => {
    let databaseUrl: string;
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const container = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = container.getConnectionUri();
      stopDatabase = () => container.stop().then(() => undefined);
    }
    await migrate(databaseUrl);
    database = new ApplicationDatabase(databaseUrl);
    await resetTestDatabase(database.db);
    api = createApi({
      operations: new OperationRepository(database.db),
      artifacts: new FileArtifactStore(".lirna/test-artifacts"),
      domain: new DomainDatabase(database.db),
      workflows: {} as WorkflowRunRepository,
      sources: new SourceLibrary(database.db),
      identifyActor: (c) => c.req.header("authorization") === "Service agent" ? "agent" : "human",
    });
    address = await api.listen();
  });

  afterAll(async () => {
    await api?.close();
    await database?.close();
    await stopDatabase?.();
  });

  it("admits one immutable text Source state only for an explicit human action", async () => {
    const response = await fetch(`${address}/api/sources`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: "A synthetic publication",
        text: "First line.\r\n\r\n   Second   line.  ",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      }),
    });

    expect(response.status).toBe(201);
    const admitted = (await response.json()) as {
      id: string;
      state: { id: string; normalizedText: string; rightsBasis: string; sensitivityLevel: string };
    };
    expect(admitted.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(admitted.state.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(admitted).toMatchObject({
      state: {
        normalizedText: "First line.\n\nSecond line.",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      },
    });

    const readResponse = await fetch(`${address}/api/sources/${admitted.id}`);
    expect(readResponse.status).toBe(200);
    expect(await readResponse.json()).toEqual(admitted);
  });

  it("refuses admission through an agent-authenticated control plane", async () => {
    const response = await fetch(`${address}/api/sources`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Service agent" },
      body: JSON.stringify({
        title: "Agent-selected publication",
        text: "This must not enter the library.",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      }),
    });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Only an explicit human action can admit a Source",
    });
  });

  it("refuses mutation or deletion of an admitted Source state", async () => {
    const admitted = await new SourceLibrary(database.db).admitText({
      title: "Immutable evidence",
      text: "Exact evidence.",
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    });

    await expect(executeTestSql(database.db, sql`
      UPDATE source_states SET authoritative_text = 'tampered' WHERE id = ${admitted.state.id}
    `)).rejects.toThrow(/append-only/i);
    await expect(executeTestSql(database.db, sql`
      DELETE FROM source_states WHERE id = ${admitted.state.id}
    `)).rejects.toThrow(/append-only/i);
  });
});
