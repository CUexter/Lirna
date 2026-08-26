import { describe, expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { Context } from "../../context";
import type { DerivativeUpdateOperations } from "../../derivative-updates/derivative-update-contract";
import type { ActiveReadingDerivativeOperations } from "../../sep-admission/active-reading-derivative";
import { sourceDerivativesRouter } from "./source-derivatives";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";
const derivativeId = "30000000-0000-4000-8000-000000000000";

describe("Source Derivative routes", () => {
  test("returns inactive invalid candidates without authentication", async () => {
    const candidate = invalidCandidate();
    await expect(
      call(
        sourceDerivativesRouter.generate,
        { sourceId, stateId },
        {
          context: context(
            generationOperations({
              async generate() {
                return candidate;
              },
            }),
          ),
        },
      ),
    ).resolves.toEqual(candidate);
  });

  test("attributes explicit activation to the unauthenticated actor", async () => {
    let received: unknown;
    const activation = {
      id: "40000000-0000-4000-8000-000000000000",
      derivativeId,
      sequence: 2,
      actorId: "unauthenticated",
      reason: "Reviewed candidate",
      activatedAt: "2026-08-25T00:00:00.000Z",
      consequences: comparison(),
    };
    await expect(
      call(
        sourceDerivativesRouter.activate,
        {
          sourceId,
          stateId,
          derivativeId,
          expectedBaselineSequence: 1,
          reason: "Reviewed candidate",
          expectedConsequences: comparison(),
        },
        {
          context: context(
            generationOperations(),
            activeOperations({
              async activate(input) {
                received = input;
                return { status: "activated", activation };
              },
            }),
          ),
        },
      ),
    ).resolves.toEqual(activation);
    expect(received).toEqual({
      sourceId,
      stateId,
      derivativeId,
      expectedBaselineSequence: 1,
      reason: "Reviewed candidate",
      expectedConsequences: comparison(),
      actorId: "unauthenticated",
    });
  });

  test("does not activate an invalid or foreign candidate", async () => {
    await expect(
      call(
        sourceDerivativesRouter.activate,
        {
          sourceId,
          stateId,
          derivativeId,
          expectedBaselineSequence: 1,
          reason: "Reviewed candidate",
          expectedConsequences: comparison(),
        },
        {
          context: context(
            generationOperations(),
            activeOperations({
              async activate() {
                return { status: "candidate-invalid" };
              },
            }),
          ),
        },
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "Reading Derivative candidate is invalid",
    });
  });
});

function generationOperations(
  overrides: Partial<DerivativeUpdateOperations> = {},
): DerivativeUpdateOperations {
  return {
    async generate() {
      return undefined;
    },
    ...overrides,
  };
}

function activeOperations(
  overrides: Partial<ActiveReadingDerivativeOperations> = {},
): ActiveReadingDerivativeOperations {
  return {
    async read() {
      return { status: "no-active-derivative" };
    },
    async previewActivation() {
      return { status: "candidate-not-found" };
    },
    async activate() {
      return { status: "candidate-not-found" };
    },
    ...overrides,
  };
}

function context(
  derivativeUpdates: DerivativeUpdateOperations,
  activeReadingDerivatives: ActiveReadingDerivativeOperations = activeOperations(),
): Context {
  return {
    derivativeUpdates,
    activeReadingDerivatives,
    annotations: {} as Context["annotations"],
    citationResolutions: {} as Context["citationResolutions"],
    readingPositions: {} as Context["readingPositions"],
    sepAdmissions: {} as Context["sepAdmissions"],
    admittedSourceStates: {} as Context["admittedSourceStates"],
  };
}

function invalidCandidate() {
  return {
    id: derivativeId,
    sourceStateId: stateId,
    kind: "sep-reading-v1" as const,
    valid: false,
    generation: {
      version: 2,
      parser: { id: "parse5", version: "7.3.0" },
      renderer: { id: "lirna-reading-react", version: "1" },
      inputResourceHashes: [{ identity: "article", sha256: "a".repeat(64) }],
    },
    validation: {
      status: "invalid" as const,
      checks: [
        {
          subject: "typed-structure" as const,
          status: "failed" as const,
          messages: ["Invalid structure"],
        },
      ],
    },
    comparison: comparison(),
    createdAt: "2026-08-25T00:00:00.000Z",
  };
}

function comparison() {
  return {
    semantic: { changedComponents: [] },
    structure: [
      {
        subject: "components" as const,
        before: 1,
        after: 0,
        beforeSha256: "a".repeat(64),
        afterSha256: "b".repeat(64),
      },
    ],
    diagnostics: { added: [], removed: [] },
    relocations: [],
  };
}
