import { isDeepStrictEqual } from "node:util";
import type { db } from "@lirna/db";
import {
  sourceStateDerivativeActivations,
  sourceStateDerivatives,
  sourceStates,
  sources,
} from "@lirna/db/schema/sources";
import { and, desc, eq } from "drizzle-orm";
import { compareReadingDerivatives } from "../../derivative-updates/derivative-analysis";
import type { DerivativeComparison } from "../../derivative-updates/derivative-update-contract";
import { serializeActivation } from "../../derivative-updates/derivative-update-projection";
import { sourceHandlingPolicySchema } from "../../source-handling-policy/source-handling-policy";
import {
  readSepReadingDerivative,
  sepReadingContractSchema,
  sepReadingDerivativeKind,
} from "../reading/contract";
import type {
  ActiveReadingDerivativeOperations,
  ActiveReadingDerivativeReadResult,
  ReadingDerivativeActivationPreviewResult,
  ReadingDerivativeActivationResult,
} from "./active-reading-derivative";
import { ActiveReadingDerivativeInvariantError } from "./active-reading-derivative";
import {
  isRetryableActivationConflict,
  readAuthoredAnchors,
} from "./active-reading-derivative-queries";
import {
  type DatabaseExecutor,
  lockSourceState,
  sourceStateExists,
} from "./evidence";

export function readActiveReadingDerivativeInSnapshot(
  database: DatabaseExecutor,
  input: { sourceId: string; stateId: string },
) {
  return readActiveReadingDerivative(database, input);
}

export class DrizzleActiveReadingDerivativeStore
  implements ActiveReadingDerivativeOperations
{
  constructor(private readonly database: typeof db) {}

  read(input: { sourceId: string; stateId: string }) {
    return this.readInSnapshot(this.database, input);
  }

  readInSnapshot(
    database: DatabaseExecutor,
    input: { sourceId: string; stateId: string },
  ) {
    return readActiveReadingDerivative(database, input);
  }

  async previewActivation(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
  }): Promise<ReadingDerivativeActivationPreviewResult> {
    const candidate = await readCandidate(this.database, input);
    if (candidate.status !== "ready") return candidate;
    const active = await readActiveReadingDerivative(this.database, input);
    if (active.status === "source-state-not-found") return active;
    const baseline = active.status === "active" ? active.value : undefined;
    return {
      status: "ready",
      baselineSequence: baseline?.activationSequence ?? 0,
      consequences: compareReadingDerivatives(
        baseline?.reading,
        candidate.reading,
        baseline?.derivativeId,
        await readAuthoredAnchors(this.database, input.sourceId, input.stateId),
      ),
    };
  }

  async activate(input: {
    sourceId: string;
    stateId: string;
    derivativeId: string;
    actorId: string;
    reason: string;
    expectedBaselineSequence: number;
    expectedConsequences: DerivativeComparison;
  }): Promise<ReadingDerivativeActivationResult> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await this.database.transaction(
          async (tx) => this.activateLocked(tx, input),
          { isolationLevel: "serializable" },
        );
      } catch (error) {
        if (!isRetryableActivationConflict(error) || attempt === 2) throw error;
      }
    }
    throw new Error("Reading Derivative Activation retry limit exceeded");
  }

  private async activateLocked(
    tx: Parameters<Parameters<(typeof db)["transaction"]>[0]>[0],
    input: Parameters<ActiveReadingDerivativeOperations["activate"]>[0],
  ): Promise<ReadingDerivativeActivationResult> {
    if (!(await lockSourceState(tx, input)))
      return { status: "source-state-not-found" };
    const candidate = await readCandidate(tx, input, true);
    if (candidate.status !== "ready") return candidate;
    const active = await readActiveReadingDerivative(tx, input, true);
    if (active.status === "source-state-not-found") return active;
    const baseline = active.status === "active" ? active.value : undefined;
    if (input.expectedBaselineSequence !== (baseline?.activationSequence ?? 0))
      return { status: "stale-review" };
    const consequences = compareReadingDerivatives(
      baseline?.reading,
      candidate.reading,
      baseline?.derivativeId,
      await readAuthoredAnchors(tx, input.sourceId, input.stateId),
    );
    if (!isDeepStrictEqual(consequences, input.expectedConsequences))
      return { status: "stale-review" };
    const sequence = (await latestSequence(tx, input.stateId)) + 1;
    const [activation] = await tx
      .insert(sourceStateDerivativeActivations)
      .values({
        sourceStateId: input.stateId,
        derivativeId: input.derivativeId,
        kind: sepReadingDerivativeKind,
        sequence,
        actorId: input.actorId,
        reason: input.reason,
        consequences,
      })
      .returning();
    return activation
      ? {
          status: "activated",
          activation: serializeActivation(activation, consequences),
        }
      : { status: "candidate-not-found" };
  }
}

async function latestSequence(database: DatabaseExecutor, stateId: string) {
  const [latest] = await database
    .select({ sequence: sourceStateDerivativeActivations.sequence })
    .from(sourceStateDerivativeActivations)
    .where(
      and(
        eq(sourceStateDerivativeActivations.sourceStateId, stateId),
        eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
      ),
    )
    .orderBy(desc(sourceStateDerivativeActivations.sequence))
    .limit(1);
  return latest?.sequence ?? 0;
}

async function readActiveReadingDerivative(
  database: DatabaseExecutor,
  input: { sourceId: string; stateId: string },
  stateAlreadyChecked = false,
): Promise<ActiveReadingDerivativeReadResult> {
  const [state] = await database
    .select({
      sourceId: sourceStates.sourceId,
      sourceTitle: sources.title,
      rightsBasis: sourceStates.rightsBasis,
      sensitivityLevel: sourceStates.sensitivityLevel,
    })
    .from(sourceStates)
    .innerJoin(sources, eq(sources.id, sourceStates.sourceId))
    .where(
      and(
        eq(sourceStates.id, input.stateId),
        eq(sourceStates.sourceId, input.sourceId),
      ),
    );
  if (!state) {
    if (stateAlreadyChecked)
      throw new Error("Locked Source state became unavailable");
    return { status: "source-state-not-found" };
  }
  const [row] = await database
    .select({
      derivativeId: sourceStateDerivatives.id,
      payload: sourceStateDerivatives.payload,
      derivativeStateId: sourceStateDerivatives.sourceStateId,
      derivativeKind: sourceStateDerivatives.kind,
      valid: sourceStateDerivatives.valid,
      activationId: sourceStateDerivativeActivations.id,
      activationSequence: sourceStateDerivativeActivations.sequence,
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
        eq(sourceStateDerivativeActivations.sourceStateId, input.stateId),
        eq(sourceStateDerivativeActivations.kind, sepReadingDerivativeKind),
      ),
    )
    .orderBy(desc(sourceStateDerivativeActivations.sequence))
    .limit(1);
  if (!row) return { status: "no-active-derivative" };
  if (
    row.derivativeStateId !== input.stateId ||
    row.derivativeKind !== sepReadingDerivativeKind ||
    !row.valid
  )
    throw new ActiveReadingDerivativeInvariantError(
      "Newest Reading Derivative Activation violates selection invariants",
    );
  return {
    status: "active",
    value: {
      sourceId: state.sourceId,
      sourceTitle: state.sourceTitle,
      stateId: input.stateId,
      derivativeId: row.derivativeId,
      activationId: row.activationId,
      activationSequence: row.activationSequence,
      reading: readSepReadingDerivative(row.payload),
      policy: sourceHandlingPolicySchema.parse({
        rightsBasis: state.rightsBasis,
        sensitivityLevel: state.sensitivityLevel,
      }),
    },
  };
}

async function readCandidate(
  database: DatabaseExecutor,
  input: { sourceId: string; stateId: string; derivativeId: string },
  stateAlreadyChecked = false,
) {
  if (!stateAlreadyChecked) {
    if (!(await sourceStateExists(database, input)))
      return { status: "source-state-not-found" as const };
  }
  const [candidate] = await database
    .select({
      payload: sourceStateDerivatives.payload,
      valid: sourceStateDerivatives.valid,
    })
    .from(sourceStateDerivatives)
    .where(
      and(
        eq(sourceStateDerivatives.id, input.derivativeId),
        eq(sourceStateDerivatives.sourceStateId, input.stateId),
        eq(sourceStateDerivatives.kind, sepReadingDerivativeKind),
      ),
    );
  if (!candidate) return { status: "candidate-not-found" as const };
  if (!candidate.valid) return { status: "candidate-invalid" as const };
  const reading = sepReadingContractSchema.safeParse(candidate.payload);
  return reading.success
    ? { status: "ready" as const, reading: reading.data }
    : { status: "candidate-invalid" as const };
}
