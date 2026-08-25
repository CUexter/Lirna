import { randomUUID } from "node:crypto";
import type { db } from "@lirna/db";
import { annotations } from "@lirna/db/schema/annotations";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import { readingPositions } from "@lirna/db/schema/reading-positions";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
} from "@lirna/db/schema/sources";
import { and, asc, desc, eq } from "drizzle-orm";
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
  projectAuthoredAnchors,
  projectCandidate,
  serializeActivation,
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

  async activate(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
    actorId: string;
    reason: string;
    expectedConsequences: import("./derivative-update-contract").DerivativeComparison;
  }) {
    return this.database.transaction(
      async (tx) => {
        const [derivative] = await tx
          .select()
          .from(sourceStateDerivatives)
          .innerJoin(
            sourceStates,
            eq(sourceStates.id, sourceStateDerivatives.sourceStateId),
          )
          .where(
            and(
              eq(sourceStateDerivatives.id, input.derivativeId),
              eq(sourceStateDerivatives.sourceStateId, input.stateId),
              eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
              eq(sourceStateDerivatives.valid, true),
              eq(sourceStates.sourceId, input.sourceId),
            ),
          )
          .for("update");
        if (!derivative) return undefined;
        const record = derivative.source_state_derivatives;
        const [active, annotationRows, positionRows, resolutionRows] =
          await Promise.all([
            tx
              .select({
                id: sourceStateDerivatives.id,
                payload: sourceStateDerivatives.payload,
              })
              .from(sourceStateDerivativeActivations)
              .innerJoin(
                sourceStateDerivatives,
                eq(
                  sourceStateDerivatives.id,
                  sourceStateDerivativeActivations.derivativeId,
                ),
              )
              .where(
                and(
                  eq(
                    sourceStateDerivativeActivations.sourceStateId,
                    input.stateId,
                  ),
                  eq(
                    sourceStateDerivativeActivations.kind,
                    sepReadingDerivativeKind,
                  ),
                ),
              )
              .orderBy(
                desc(sourceStateDerivativeActivations.activatedAt),
                desc(sourceStateDerivativeActivations.id),
              )
              .limit(1),
            tx
              .select()
              .from(annotations)
              .where(eq(annotations.sourceStateId, input.stateId))
              .orderBy(asc(annotations.id)),
            tx
              .select()
              .from(readingPositions)
              .where(eq(readingPositions.sourceStateId, input.stateId))
              .orderBy(asc(readingPositions.componentIdentity)),
            tx
              .select()
              .from(citationResolutions)
              .where(eq(citationResolutions.sourceStateId, input.stateId))
              .orderBy(
                asc(citationResolutions.createdAt),
                asc(citationResolutions.id),
              ),
          ]);
        const baseline = active[0];
        const consequences = compareReadingDerivatives(
          baseline ? readSepReadingDerivative(baseline.payload) : undefined,
          readSepReadingDerivative(record.payload),
          baseline?.id,
          projectAuthoredAnchors(annotationRows, positionRows, resolutionRows),
        );
        if (
          JSON.stringify(consequences) !==
          JSON.stringify(input.expectedConsequences)
        )
          return undefined;
        const [activation] = await tx
          .insert(sourceStateDerivativeActivations)
          .values({
            sourceStateId: input.stateId,
            derivativeId: input.derivativeId,
            kind: sepReadingDerivativeKind,
            actorId: input.actorId,
            reason: input.reason,
            consequences,
          })
          .returning();
        return activation
          ? serializeActivation(activation, consequences)
          : undefined;
      },
      { isolationLevel: "serializable" },
    );
  }

  async previewActivation(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
  }) {
    const [derivative] = await this.database
      .select({ payload: sourceStateDerivatives.payload })
      .from(sourceStateDerivatives)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, sourceStateDerivatives.sourceStateId),
      )
      .where(
        and(
          eq(sourceStateDerivatives.id, input.derivativeId),
          eq(sourceStateDerivatives.sourceStateId, input.stateId),
          eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
          eq(sourceStateDerivatives.valid, true),
          eq(sourceStates.sourceId, input.sourceId),
        ),
      );
    if (!derivative) return undefined;
    const baseline = await activeDerivative(this.database, input.stateId);
    return compareReadingDerivatives(
      baseline?.reading,
      readSepReadingDerivative(derivative.payload),
      baseline?.id,
      await authoredAnchors(this.database, input.stateId),
    );
  }
}
