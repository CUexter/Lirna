import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStateResources,
  sourceStates,
  sources,
  user,
} from "./schema";
import {
  createPostgresTestFixture,
  generationMetadata,
} from "./test-support/postgres-fixture";
import { verifySepAdmissionPersistence } from "./test-support/sep-admission";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const fixture = createPostgresTestFixture(adminUrl);

describePostgres("PostgreSQL migrations and database repository", () => {
  beforeAll(fixture.setup, 30_000);

  afterAll(fixture.cleanup);

  test("writes and reads a user through the exported database seam", async () => {
    await fixture.database.insert(user).values({
      id: "integration-user",
      name: "Integration User",
      email: "integration@example.test",
    });

    const rows = await fixture.database
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.id, "integration-user"));

    expect(rows).toEqual([
      { id: "integration-user", email: "integration@example.test" },
    ]);
  });

  test("surfaces the committed unique-email constraint", async () => {
    const duplicate = fixture.database.insert(user).values({
      id: "duplicate-user",
      name: "Duplicate User",
      email: "integration@example.test",
    });

    await expect(duplicate.execute()).rejects.toMatchObject({
      cause: {
        code: "23505",
        constraint: "user_email_unique",
      },
    });
  });

  test("persists and cascades temporary SEP Admission evidence", async () => {
    await verifySepAdmissionPersistence(fixture.database);
  });

  test("retains exact Source-state evidence and activates only a valid matching Derivative", async () => {
    const sourceId = randomUUID();
    const stateId = randomUUID();
    const otherStateId = randomUUID();
    const derivativeId = randomUUID();
    const invalidDerivativeId = randomUUID();
    const activationId = randomUUID();
    const body = Buffer.from("publisher-authored evidence", "utf8");
    const sha256 = createHash("sha256").update(body).digest("hex");

    const { database } = fixture;

    await database.insert(sources).values({
      id: sourceId,
      title: "Integration Source",
      stableKey: `sep:integration-${sourceId}`,
    });
    await database.insert(sourceStates).values([
      {
        id: stateId,
        sourceId,
        sequence: 0,
        adapterId: "sep",
        observationKey: "submitted",
        canonicalUrl: "https://plato.stanford.edu/entries/integration/",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      },
      {
        id: otherStateId,
        sourceId,
        sequence: 1,
        adapterId: "sep",
        observationKey: "recommended-archive",
        canonicalUrl:
          "https://plato.stanford.edu/archives/spr2026/entries/integration/",
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      },
    ]);
    await database.insert(sourceStateResources).values({
      sourceStateId: stateId,
      identity: "active:/",
      role: "main",
      requestedUrl: "https://plato.stanford.edu/entries/integration/",
      finalUrl: "https://plato.stanford.edu/entries/integration/",
      status: 200,
      mediaType: "text/html",
      charset: "utf-8",
      retrievedAt: new Date(),
      selectedHeaders: { "content-type": "text/html; charset=utf-8" },
      requestCount: 1,
      downloadedBytes: body.byteLength,
      byteLength: body.byteLength,
      sha256,
      discoveryEdge: "submitted-entry",
      depth: 0,
      body,
    });
    await database.insert(sourceStateDerivatives).values([
      {
        id: derivativeId,
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        generation: generationMetadata(),
        payload: { sourceStateId: stateId, derivativeId },
        validation: [],
      },
      {
        id: invalidDerivativeId,
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: false,
        generation: generationMetadata(),
        payload: { sourceStateId: stateId, derivativeId: invalidDerivativeId },
        validation: ["invalid test fixture"],
      },
    ]);
    await database.insert(sourceStateDerivativeActivations).values({
      id: activationId,
      sourceStateId: stateId,
      derivativeId,
      kind: "sep-reading-v1",
    });

    const [retained] = await database
      .select({
        body: sourceStateResources.body,
        sha256: sourceStateResources.sha256,
      })
      .from(sourceStateResources)
      .where(eq(sourceStateResources.sourceStateId, stateId));
    expect(retained).toEqual({ body, sha256 });

    await expect(
      database
        .insert(sourceStateDerivatives)
        .values({
          sourceStateId: otherStateId,
          kind: "sep-reading-v1",
          previousDerivativeId: derivativeId,
          valid: true,
          generation: generationMetadata(),
          payload: {},
          validation: [],
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "source_state_derivatives_previous_matches_check",
      },
    });
    await expect(
      database
        .insert(sourceStateDerivativeActivations)
        .values({
          sourceStateId: otherStateId,
          derivativeId,
          kind: "sep-reading-v1",
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "source_state_derivative_activations_matching_valid_check",
      },
    });
    await expect(
      database
        .update(sourceStateDerivativeActivations)
        .set({ reason: "Rewritten history" })
        .where(eq(sourceStateDerivativeActivations.id, activationId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
    await expect(
      database
        .delete(sourceStateDerivativeActivations)
        .where(eq(sourceStateDerivativeActivations.id, activationId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
    await expect(
      database
        .insert(sourceStateDerivativeActivations)
        .values({
          sourceStateId: stateId,
          derivativeId: invalidDerivativeId,
          kind: "sep-reading-v1",
        })
        .execute(),
    ).rejects.toMatchObject({
      cause: {
        code: "23514",
        constraint: "source_state_derivative_activations_matching_valid_check",
      },
    });
    await expect(
      database
        .update(sourceStates)
        .set({ sensitivityLevel: "local-only" })
        .where(eq(sourceStates.id, stateId))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
  });
});
