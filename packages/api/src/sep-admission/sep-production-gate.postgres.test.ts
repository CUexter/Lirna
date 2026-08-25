import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from "bun:test";
import { readFileSync } from "node:fs";
import { sourceStateResources } from "@lirna/db/schema/sources";
import { eq } from "drizzle-orm";

import { DrizzleDerivativeUpdateStore } from "../derivative-updates/derivative-update-store";
import {
  openSepAdmissionPostgres,
  type SepAdmissionPostgres,
  sepAdmissionPostgresAdminUrl,
} from "./fixtures/postgres";
import {
  productionCorpusPages,
  productionEntryUrl,
} from "./fixtures/production-corpus";
import { createSepAdmissionOperations } from "./sep-admission";
import { createSepCaptureClient } from "./sep-capture";
import { controlledTransport, redirect } from "./sep-capture-test-fixture";

const budgets = JSON.parse(
  readFileSync(
    new URL("../../../../config/sep-production-budgets.json", import.meta.url),
    "utf8",
  ),
).budgets as {
  captureMilliseconds: number;
  derivationMilliseconds: number;
  apiPayloadBytes: number;
  largestRetainedAssetBytes: number;
};
const describePostgres = sepAdmissionPostgresAdminUrl
  ? describe
  : describe.skip;

let opened: SepAdmissionPostgres;
let originalFetch: typeof globalThis.fetch;
let unexpectedNetworkRequests: string[];

describePostgres("SEP production journey", () => {
  beforeAll(async () => {
    opened = await openSepAdmissionPostgres("production-gate");
  }, 30_000);

  afterAll(async () => {
    await opened?.cleanup();
  });

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    unexpectedNetworkRequests = [];
    globalThis.fetch = (async (input) => {
      unexpectedNetworkRequests.push(String(input));
      throw new Error(
        "The deterministic evidence path attempted live network I/O",
      );
    }) as typeof globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("captures, admits, activates, and rolls back immutable controlled evidence within budget", async () => {
    const requested: string[] = [];
    const pages = productionCorpusPages();
    pages.set(
      "/entries/synthetic-production/escape.html",
      redirect("http://127.0.0.1/private"),
    );
    const transport = controlledTransport(
      "synthetic-production",
      pages,
      requested,
    );

    const bounded = await createSepCaptureClient({
      fetch: transport,
      limits: { maxComponents: 1 },
    }).capture(productionEntryUrl);
    expect(bounded.captureReport).toMatchObject({ completeness: "stopped" });
    expect(
      bounded.captureReport.unresolvedResources.some(
        ({ limit, reason }) => limit && reason.includes("Component limit"),
      ),
    ).toBe(true);

    const redirectPages = productionCorpusPages();
    redirectPages.set(
      "/entries/synthetic-production/notes.html",
      redirect("http://127.0.0.1/private"),
    );
    const redirected = await createSepCaptureClient({
      fetch: controlledTransport("synthetic-production", redirectPages),
    }).capture(productionEntryUrl);
    expect(redirected.captureReport.unresolvedResources).toContainEqual(
      expect.objectContaining({
        reason: expect.stringContaining("outside the HTTPS SEP origin"),
      }),
    );
    const capture = createSepCaptureClient({ fetch: transport });
    const operations = createSepAdmissionOperations({
      store: opened.store,
      capture,
      now: () => new Date("2026-08-25T12:00:00.000Z"),
    });
    const captureStarted = performance.now();
    const preview = await operations.submit(productionEntryUrl);
    const captureMilliseconds = performance.now() - captureStarted;
    expect(captureMilliseconds).toBeLessThanOrEqual(
      budgets.captureMilliseconds,
    );
    expect(preview.capture).toMatchObject({
      completeness: "complete",
      readingReadiness: "ready",
    });
    expect(preview.resources.map(({ role }) => role).toSorted()).toEqual([
      "citation-information",
      "figure-description",
      "main",
      "notes",
      "semantic-asset",
      "supplement",
    ]);
    expect(preview.resources).toContainEqual(
      expect.objectContaining({
        identity: "active:/notes.html",
        finalUrl:
          "https://plato.stanford.edu/entries/synthetic-production/notes.html",
        role: "notes",
      }),
    );
    const largestRetainedAssetBytes = Math.max(
      ...preview.resources
        .filter(({ role }) => role === "semantic-asset")
        .map(({ byteLength }) => byteLength),
    );
    expect(largestRetainedAssetBytes).toBeLessThanOrEqual(
      budgets.largestRetainedAssetBytes,
    );
    const reviewedRequests = requested.length;
    const reviewedHashes = preview.resources.map(({ identity, sha256 }) => ({
      identity,
      sha256,
    }));

    const derivationStarted = performance.now();
    const admitted = await operations.admit(preview.id, ["submitted"]);
    const derivationMilliseconds = performance.now() - derivationStarted;
    expect(derivationMilliseconds).toBeLessThanOrEqual(
      budgets.derivationMilliseconds,
    );
    expect(requested).toHaveLength(reviewedRequests);
    const state = admitted?.states[0];
    if (!(admitted && state)) throw new Error("Controlled admission failed");
    expect(
      state.resources.map(({ identity, sha256 }) => ({ identity, sha256 })),
    ).toEqual(reviewedHashes);

    const reading = await opened.store.getReading(admitted.sourceId, state.id);
    expect(reading?.components.map(({ role }) => role)).toEqual([
      "main",
      "figure-description",
      "notes",
      "supplement",
    ]);
    const notesComponent = reading?.components.find(
      ({ role }) => role === "notes",
    );
    expect(notesComponent?.toc).toEqual([
      { id: "note-one", title: "Notes", children: [] },
    ]);
    expect(notesComponent?.sections[0]?.id).toBe("note-one");
    expect(notesComponent?.plainText).toContain(
      "Footnote 1. Publisher-authored synthetic note.",
    );
    expect(JSON.stringify(reading)).not.toContain("productionFixtureExecuted");
    expect(JSON.stringify(reading)).not.toContain("<script");
    const apiPayloadBytes = Buffer.byteLength(
      JSON.stringify({ state, reading }),
    );
    expect(apiPayloadBytes).toBeLessThanOrEqual(budgets.apiPayloadBytes);
    console.info(
      "SEP backend measurements",
      JSON.stringify({
        captureMilliseconds: Math.round(captureMilliseconds),
        derivationMilliseconds: Math.round(derivationMilliseconds),
        apiPayloadBytes,
        largestRetainedAssetBytes,
      }),
    );

    const resourcesBefore = await opened.database
      .select({
        identity: sourceStateResources.identity,
        sha256: sourceStateResources.sha256,
        body: sourceStateResources.body,
      })
      .from(sourceStateResources)
      .where(eq(sourceStateResources.sourceStateId, state.id));
    const updates = new DrizzleDerivativeUpdateStore(opened.database);
    const candidate = await updates.generate({
      sourceId: admitted.sourceId,
      stateId: state.id,
    });
    if (!candidate) throw new Error("Derivative candidate was not generated");
    expect(candidate.validation.status).toBe("valid");
    const activation = await updates.activate({
      sourceId: admitted.sourceId,
      stateId: state.id,
      derivativeId: candidate.id,
      actorId: "production-gate",
      reason: "Controlled production review",
      expectedConsequences: candidate.comparison,
    });
    expect(activation?.derivativeId).toBe(candidate.id);
    const initialDerivativeId = state.derivatives[0]?.id;
    if (!initialDerivativeId) throw new Error("Initial derivative is missing");
    const rollback = await updates.previewActivation({
      sourceId: admitted.sourceId,
      stateId: state.id,
      derivativeId: initialDerivativeId,
    });
    if (!rollback) throw new Error("Rollback preview is missing");
    expect(
      await updates.activate({
        sourceId: admitted.sourceId,
        stateId: state.id,
        derivativeId: initialDerivativeId,
        actorId: "production-gate",
        reason: "Controlled rollback",
        expectedConsequences: rollback,
      }),
    ).toMatchObject({ derivativeId: initialDerivativeId });
    expect(
      await opened.database
        .select({
          identity: sourceStateResources.identity,
          sha256: sourceStateResources.sha256,
          body: sourceStateResources.body,
        })
        .from(sourceStateResources)
        .where(eq(sourceStateResources.sourceStateId, state.id)),
    ).toEqual(resourcesBefore);
    await expect(
      opened.database
        .update(sourceStateResources)
        .set({ body: Buffer.from("mutation") })
        .where(eq(sourceStateResources.sourceStateId, state.id))
        .execute(),
    ).rejects.toMatchObject({ cause: { code: "P0001" } });
    expect(unexpectedNetworkRequests).toEqual([]);
  });
});
