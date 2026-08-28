import { describe, expect, test } from "bun:test";
import { derivativeReadingFixture } from "./derivative-test-fixture";
import { createReadingDerivative } from "./reading-derivative-creation";

const sourceStateId = "20000000-0000-4000-8000-000000000000";
const previousDerivativeId = "30000000-0000-4000-8000-000000000000";

describe("Reading Derivative creation", () => {
  test("concentrates generation provenance and full validity semantics", () => {
    const reading = derivativeReadingFixture("Alpha target Omega");
    reading.provenance.inputResourceHashes.push({
      identity: "notes",
      sha256: "b".repeat(64),
    });

    const derivative = createReadingDerivative({
      sourceStateId,
      generationVersion: 2,
      previousDerivativeId,
      inputResourceHashes: [
        { identity: "notes", sha256: "b".repeat(64) },
        { identity: "article", sha256: "a".repeat(64) },
      ],
      createPayload: () => reading,
    });

    expect(derivative).toMatchObject({
      sourceStateId,
      previousDerivativeId,
      kind: "sep-reading-v1",
      valid: true,
      payload: reading,
      generation: {
        version: 2,
        parser: { id: "parse5", version: "7.3.0" },
        renderer: { id: "lirna-reading-react", version: "1" },
        inputResourceHashes: [
          { identity: "article", sha256: "a".repeat(64) },
          { identity: "notes", sha256: "b".repeat(64) },
        ],
      },
      validation: {
        status: "valid",
        checks: expect.arrayContaining([
          expect.objectContaining({
            subject: "typed-structure",
            status: "passed",
          }),
        ]),
      },
    });
  });

  test("rejects payload provenance that differs from generation evidence", () => {
    const reading = derivativeReadingFixture("Alpha target Omega");

    const derivative = createReadingDerivative({
      sourceStateId,
      generationVersion: 1,
      inputResourceHashes: [{ identity: "article", sha256: "c".repeat(64) }],
      createPayload: () => reading,
    });

    expect(derivative).toMatchObject({
      valid: false,
      payload: {
        generationError:
          "Reading Derivative provenance does not match generation evidence",
      },
      validation: { status: "invalid" },
    });
  });

  test("turns generation failure into an inspectable invalid candidate", () => {
    const derivative = createReadingDerivative({
      sourceStateId,
      generationVersion: 1,
      inputResourceHashes: [],
      createPayload: () => {
        throw new Error("Unsupported character encoding");
      },
    });

    expect(derivative).toMatchObject({
      valid: false,
      payload: { generationError: "Unsupported character encoding" },
      validation: {
        status: "invalid",
        checks: expect.arrayContaining([
          expect.objectContaining({
            subject: "typed-structure",
            status: "failed",
          }),
        ]),
      },
    });
  });
});
