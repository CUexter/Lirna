import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import { sourceStateDerivatives, sourceStates } from "@lirna/db/schema/sources";
import { and, eq } from "drizzle-orm";
import {
  readSepReadingDerivative,
  sepReadingDerivativeKind,
} from "../sep-admission/sep-reading-contract";
import { compareReadingDerivatives } from "./derivative-analysis";
import {
  buildCandidateFromEvidence,
  generationError,
} from "./derivative-candidate-builder";
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
import { validateReadingCandidate } from "./derivative-validation";

const generationParser = { id: "parse5", version: "7.3.0" } as const;
const generationRenderer = { id: "lirna-reading-react", version: "1" } as const;

export class DrizzleDerivativeUpdateStore
  implements DerivativeUpdateOperations
{
  constructor(private readonly database: typeof db) {}

  async generate(input: { sourceId: string; stateId: string }) {
    return this.database.transaction(async (tx) => {
      const [lockedState] = await tx
        .select({ id: sourceStates.id })
        .from(sourceStates)
        .where(
          and(
            eq(sourceStates.id, input.stateId),
            eq(sourceStates.sourceId, input.sourceId),
          ),
        )
        .for("update");
      return lockedState ? this.generateLocked(tx, input) : undefined;
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
    const baseline = await activeDerivative(database, input.stateId);
    const anchors = await authoredAnchors(database, input.stateId);
    let payload: unknown;
    try {
      payload = buildCandidateFromEvidence(evidence);
    } catch (error) {
      payload = { generationError: generationError(error) };
    }
    const validation = validateReadingCandidate(payload);
    const reading =
      validation.status === "valid"
        ? readSepReadingDerivative(payload)
        : undefined;
    const previous = baseline?.reading;
    const comparison = reading
      ? compareReadingDerivatives(previous, reading, baseline?.id, anchors)
      : invalidComparison(baseline?.id, anchors);
    const generation = {
      version: (await derivativeCount(database, input.stateId)) + 1,
      parser: generationParser,
      renderer: generationRenderer,
      inputResourceHashes: evidence.resources
        .map(({ identity, sha256 }) => ({ identity, sha256 }))
        .toSorted((left, right) => left.identity.localeCompare(right.identity)),
    };
    const id = randomUUID();
    const [created] = await database
      .insert(sourceStateDerivatives)
      .values({
        id,
        sourceStateId: input.stateId,
        kind: sepReadingDerivativeKind,
        previousDerivativeId: baseline?.id,
        valid: validation.status === "valid",
        generation,
        payload,
        validation: { ...validation, comparison },
      })
      .returning({ createdAt: sourceStateDerivatives.createdAt });
    return created
      ? projectCandidate({
          id,
          sourceStateId: input.stateId,
          previousDerivativeId: baseline?.id,
          generation,
          validation,
          comparison,
          reading,
          createdAt: created.createdAt,
        })
      : undefined;
  }
}
