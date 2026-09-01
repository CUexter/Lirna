import type { db } from "@lirna/db";
import { sourceStateDerivatives } from "@lirna/db/schema/sources";
import { readSepReadingDerivative } from "../sep-admission/reading/contract";
import { lockSourceState } from "../sep-admission/state/evidence";
import { compareReadingDerivatives } from "./derivative-analysis";
import { buildCandidateFromEvidence } from "./derivative-candidate-builder";
import type { DerivativeUpdateOperations } from "./derivative-update-contract";
import {
  invalidComparison,
  projectCandidate,
} from "./derivative-update-projection";
import {
  activeDerivative,
  authoredAnchors,
  type DatabaseExecutor,
  derivativeCount,
  derivativeEvidence,
} from "./derivative-update-queries";
import { createReadingDerivative } from "./reading-derivative-creation";

export class DrizzleDerivativeUpdateStore
  implements DerivativeUpdateOperations
{
  constructor(private readonly database: typeof db) {}

  async generate(input: { sourceId: string; stateId: string }) {
    return this.database.transaction(async (tx) => {
      const locked = await lockSourceState(tx, input);
      return locked ? this.generateLocked(tx, input) : undefined;
    });
  }

  private async generateLocked(
    database: DatabaseExecutor,
    input: { sourceId: string; stateId: string },
  ) {
    const evidence = await derivativeEvidence(
      database,
      input.sourceId,
      input.stateId,
    );
    if (!evidence) return undefined;
    const activeBaseline = await activeDerivative(database, input.stateId);
    const anchors = await authoredAnchors(
      database,
      input.sourceId,
      input.stateId,
    );
    const derivative = createReadingDerivative({
      sourceStateId: input.stateId,
      generationVersion: (await derivativeCount(database, input.stateId)) + 1,
      ...(activeBaseline?.id
        ? { previousDerivativeId: activeBaseline.id }
        : {}),
      inputResourceHashes: evidence.resources.map(({ identity, sha256 }) => ({
        identity,
        sha256,
      })),
      createPayload: () => buildCandidateFromEvidence(evidence),
    });
    const { generation, id, payload, validation } = derivative;
    const reading =
      validation.status === "valid"
        ? readSepReadingDerivative(payload)
        : undefined;
    const previous = activeBaseline?.reading;
    const comparison = reading
      ? compareReadingDerivatives(
          previous,
          reading,
          activeBaseline?.id,
          anchors,
        )
      : invalidComparison(activeBaseline?.id, anchors);
    const [created] = await database
      .insert(sourceStateDerivatives)
      .values({
        ...derivative,
        validation: { ...validation, comparison },
      })
      .returning({ createdAt: sourceStateDerivatives.createdAt });
    return created
      ? projectCandidate({
          id,
          sourceStateId: input.stateId,
          previousDerivativeId: activeBaseline?.id,
          generation,
          validation,
          comparison,
          reading,
          createdAt: created.createdAt,
        })
      : undefined;
  }
}
