import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import {
  createPostgresTestConnection,
  createPostgresTestDatabase,
} from "@lirna/db/test-support/postgres-database";

import { readingPayload } from "../annotations/annotation-store.postgres-test-support";
import { generationMetadata } from "../derivative-updates/derivative-test-fixture";
import { DrizzleActiveReadingDerivativeStore } from "../sep-admission/active-reading-derivative-store";
import { createPostgresInsertBlocker } from "./citation-resolution-concurrency.postgres-test-support";
import { InvalidCitationResolutionError } from "./citation-resolution-contract";
import { DrizzleCitationResolutionStore } from "./citation-resolution-store";

const adminUrl = process.env.POSTGRES_ADMIN_URL;
const describePostgres = adminUrl ? describe : describe.skip;
const databaseName = `lirna_citation_resolution_concurrency_${process.pid}_${randomUUID().replaceAll("-", "")}`;

let database: Awaited<
  ReturnType<typeof createPostgresTestDatabase>
>["database"];
let databaseUrl: string;
let cleanupDatabase: (() => Promise<void>) | undefined;
let blockInserts: ReturnType<typeof createPostgresInsertBlocker>;

describePostgres("Citation resolution write concurrency in PostgreSQL", () => {
  beforeAll(async () => {
    if (!adminUrl) return;
    const opened = await createPostgresTestDatabase(adminUrl, databaseName);
    database = opened.database;
    databaseUrl = opened.databaseUrl;
    cleanupDatabase = opened.cleanup;
    blockInserts = createPostgresInsertBlocker(database, databaseUrl);
  }, 30_000);

  afterAll(async () => cleanupDatabase?.());

  test("lets a Citation decision serialize before a concurrent Activation", async () => {
    const fixture = await createFixture({ candidateAvailable: false });
    const preview = await requirePreview(fixture);
    const blocked = await blockInserts("citation_resolutions");
    try {
      const creation = fixture.resolutions.create(selection(fixture));
      await blocked.waitUntilInsertBlocked();
      const activation = activate(fixture, preview);
      await blocked.waitUntilOtherWriteBlocked();
      await blocked.release();

      await expect(creation).resolves.toMatchObject({
        derivativeId: fixture.oldDerivativeId,
      });
      await expect(activation).resolves.toEqual({ status: "stale-review" });
      await expect(fixture.activeReading.read(fixture)).resolves.toMatchObject({
        status: "active",
        value: { derivativeId: fixture.oldDerivativeId },
      });
    } finally {
      await blocked.close();
      await fixture.close();
    }
  }, 30_000);

  test("revalidates a Citation decision after a concurrent Activation wins", async () => {
    const fixture = await createFixture({ candidateAvailable: false });
    const preview = await requirePreview(fixture);
    const blocked = await blockInserts("source_state_derivative_activations");
    try {
      const activation = activate(fixture, preview);
      await blocked.waitUntilInsertBlocked();
      const creation = fixture.resolutions.create(selection(fixture));
      await blocked.waitUntilOtherWriteBlocked();
      await blocked.release();

      await expect(activation).resolves.toMatchObject({ status: "activated" });
      await expect(creation).rejects.toBeInstanceOf(
        InvalidCitationResolutionError,
      );
      await expect(fixture.activeReading.read(fixture)).resolves.toMatchObject({
        status: "active",
        value: { derivativeId: fixture.newDerivativeId },
      });
      await expect(
        fixture.resolutions.list(fixture.sourceId, fixture.stateId),
      ).resolves.toEqual([]);
    } finally {
      await blocked.close();
      await fixture.close();
    }
  }, 30_000);

  test("revalidates a clear against the Derivative activated first", async () => {
    const fixture = await createFixture({
      candidateAvailable: true,
      shiftMention: true,
    });
    await fixture.resolutions.create(selection(fixture));
    const preview = await requirePreview(fixture);
    const blocked = await blockInserts("source_state_derivative_activations");
    try {
      const activation = activate(fixture, preview);
      await blocked.waitUntilInsertBlocked();
      const clearing = fixture.resolutions.clear({
        sourceId: fixture.sourceId,
        stateId: fixture.stateId,
        componentIdentity: "article:main",
        mentionId: "citation-mention-1",
        actorId: "user-1",
      });
      await blocked.waitUntilOtherWriteBlocked();
      await blocked.release();

      await expect(activation).resolves.toMatchObject({ status: "activated" });
      await expect(clearing).resolves.toBeTrue();
      const history = await fixture.resolutions.history(
        fixture.sourceId,
        fixture.stateId,
      );
      expect(history.at(-1)).toMatchObject({
        action: "cleared",
        derivativeId: fixture.newDerivativeId,
        normalizedStartOffset: 7,
        normalizedEndOffset: 11,
        exactText: "Read",
      });
    } finally {
      await blocked.close();
      await fixture.close();
    }
  }, 30_000);
});

type Fixture = Awaited<ReturnType<typeof createFixture>>;

async function createFixture({
  candidateAvailable,
  shiftMention = false,
}: {
  candidateAvailable: boolean;
  shiftMention?: boolean;
}) {
  const sourceId = randomUUID();
  const stateId = randomUUID();
  await database.insert(sources).values({
    id: sourceId,
    title: "Concurrent Citation resolution",
    stableKey: `citation-concurrency:${sourceId}`,
  });
  await database.insert(sourceStates).values({
    id: stateId,
    sourceId,
    sequence: 0,
    adapterId: "test",
    rightsBasis: "publicly-accessible",
    sensitivityLevel: "ordinary-cloud",
  });

  const oldPayload = ambiguousReading(sourceId, stateId);
  const newPayload = structuredClone(oldPayload);
  const component = newPayload.components[0];
  const title = component?.sections[0]?.title;
  const mention = title?.[0];
  if (!(component && title && mention?.kind === "citation")) {
    throw new Error("Reading fixture has no Citation mention");
  }
  if (!candidateAvailable) {
    mention.state = "unresolved";
    mention.candidates = [];
  }
  if (shiftMention) {
    title.unshift({ kind: "text", text: "Before " });
    component.plainText = `Before ${component.plainText}`;
    newPayload.plainText = component.plainText;
  }

  const [oldDerivative, newDerivative] = await database
    .insert(sourceStateDerivatives)
    .values(
      [oldPayload, newPayload].map((payload, index) => ({
        sourceStateId: stateId,
        kind: "sep-reading-v1",
        valid: true,
        generation: {
          ...generationMetadata(payload.provenance.inputResourceHashes),
          version: index + 1,
        },
        payload,
        validation: { schema: "sep-reading-v1", status: "valid" },
      })),
    )
    .returning({ id: sourceStateDerivatives.id });
  if (!(oldDerivative && newDerivative)) {
    throw new Error("Reading Derivative fixtures are missing");
  }
  await database.insert(sourceStateDerivativeActivations).values({
    sourceStateId: stateId,
    derivativeId: oldDerivative.id,
    kind: "sep-reading-v1",
  });

  const activationConnection = createPostgresTestConnection(databaseUrl);
  return {
    sourceId,
    stateId,
    oldDerivativeId: oldDerivative.id,
    newDerivativeId: newDerivative.id,
    activeReading: new DrizzleActiveReadingDerivativeStore(
      activationConnection.database,
    ),
    resolutions: new DrizzleCitationResolutionStore(database),
    close: activationConnection.close,
  };
}

function ambiguousReading(sourceId: string, stateId: string) {
  const payload = readingPayload(sourceId, stateId);
  const component = payload.components[0];
  const mention = component?.sections[0]?.title[0];
  if (!component || mention?.kind !== "citation") {
    throw new Error("Reading fixture has no Citation mention");
  }
  mention.state = "ambiguous";
  mention.candidates = ["entry-01"];
  component.bibliography = [
    {
      id: "references",
      title: "References",
      entries: [
        {
          id: "entry-01",
          label: "[1]",
          text: "Candidate one",
          anchor: "entry-01",
          links: [],
          provenance: {
            componentIdentity: component.identity,
            locator: "#entry-01",
          },
        },
      ],
      provenance: {
        componentIdentity: component.identity,
        locator: "#references",
      },
    },
  ];
  return payload;
}

function selection(fixture: Fixture) {
  return {
    sourceId: fixture.sourceId,
    stateId: fixture.stateId,
    componentIdentity: "article:main",
    mentionId: "citation-mention-1",
    bibliographyComponentIdentity: "article:main",
    bibliographyEntryId: "entry-01",
    actorId: "user-1",
    method: "manual" as const,
  };
}

async function requirePreview(fixture: Fixture) {
  const preview = await fixture.activeReading.previewActivation({
    sourceId: fixture.sourceId,
    stateId: fixture.stateId,
    derivativeId: fixture.newDerivativeId,
  });
  if (preview.status !== "ready") throw new Error("Activation preview missing");
  return preview;
}

function activate(
  fixture: Fixture,
  preview: Awaited<ReturnType<typeof requirePreview>>,
) {
  return fixture.activeReading.activate({
    sourceId: fixture.sourceId,
    stateId: fixture.stateId,
    derivativeId: fixture.newDerivativeId,
    actorId: "user-1",
    reason: "Concurrent reviewed activation",
    expectedBaselineSequence: preview.baselineSequence,
    expectedConsequences: preview.consequences,
  });
}
