import type { db } from "@lirna/db";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";

import {
  type AuthoredTarget,
  authoredTargetForPublisherAnchor,
  InvalidAuthoredTargetError,
} from "../authored-targets/authored-target";
import type { ActiveReadingDerivativeOperations } from "../sep-admission/active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "../sep-admission/active-reading-derivative-store";
import type { DatabaseExecutor } from "../sep-admission/sep-state-evidence";
import { deriveCitationMentionEvidence } from "./citation-mention-evidence";
import type {
  CitationResolutionOperations,
  CitationResolutionRecord,
  ClearCitationResolutionInput,
  CreateCitationResolutionInput,
} from "./citation-resolution-contract";
import {
  InvalidCitationResolutionError,
  validateCitationResolutionMetadata,
} from "./citation-resolution-contract";
import {
  readCitationResolutionHistoryInSnapshot,
  readCitationResolutionsInSnapshot,
} from "./citation-resolution-reader";
import {
  readActiveCitationDerivative,
  runSerializedCitationWrite,
} from "./citation-resolution-transaction";

export class DrizzleCitationResolutionStore
  implements CitationResolutionOperations
{
  constructor(
    private readonly database: typeof db,
    private readonly activeReadingDerivatives: ActiveReadingDerivativeOperations = new DrizzleActiveReadingDerivativeStore(
      database,
    ),
  ) {}

  async list(sourceId: string, stateId: string) {
    return readCitationResolutionsInSnapshot(this.database, sourceId, stateId);
  }

  async history(sourceId: string, stateId: string) {
    return readCitationResolutionHistoryInSnapshot(
      this.database,
      sourceId,
      stateId,
    );
  }

  async evidence(sourceId: string, stateId: string) {
    const active = await this.activeReading(sourceId, stateId);
    return active
      ? deriveCitationMentionEvidence({
          derivativeId: active.derivativeId,
          reading: active.reading,
          rightsBasis: active.rightsBasis,
          sensitivityLevel: active.sensitivityLevel,
        })
      : undefined;
  }

  async create(input: CreateCitationResolutionInput) {
    return runSerializedCitationWrite(this.database, input, (tx) =>
      this.createLocked(tx, input),
    );
  }

  private async createLocked(
    database: DatabaseExecutor,
    input: CreateCitationResolutionInput,
  ) {
    const active = await readActiveCitationDerivative(
      database,
      input.sourceId,
      input.stateId,
    );
    if (!active) return undefined;
    const component = active.reading.components.find(
      (candidate) => candidate.identity === input.componentIdentity,
    );
    if (!component) throw new InvalidCitationResolutionError();
    const mention = this.mention(
      active,
      input.componentIdentity,
      input.mentionId,
    );
    if (!mention) throw new InvalidCitationResolutionError();
    const candidate = mention.candidates.find(
      (item) =>
        item.bibliographyComponentIdentity ===
          input.bibliographyComponentIdentity &&
        item.bibliographyEntryId === input.bibliographyEntryId,
    );
    if (!candidate) throw new InvalidCitationResolutionError();
    validateCitationResolutionMetadata(input);
    const target = this.target(component, input.mentionId);

    const [resolution] = await database
      .insert(citationResolutions)
      .values({
        sourceStateId: input.stateId,
        derivativeId: active.derivativeId,
        componentIdentity: input.componentIdentity,
        mentionId: input.mentionId,
        bibliographyComponentIdentity: candidate.bibliographyComponentIdentity,
        bibliographyEntryId: candidate.bibliographyEntryId,
        ...target,
        actorId: input.actorId,
        action: "selected",
        method: input.method,
        confidence: input.confidence ?? null,
        reasoning: input.reasoning ?? null,
      })
      .returning();
    if (!resolution) return undefined;
    return serializeSelectedResolution(resolution, input.sourceId);
  }

  async clear(input: ClearCitationResolutionInput) {
    return runSerializedCitationWrite(this.database, input, (tx) =>
      this.clearLocked(tx, input),
    );
  }

  private async clearLocked(
    database: DatabaseExecutor,
    input: ClearCitationResolutionInput,
  ) {
    const active = await readActiveCitationDerivative(
      database,
      input.sourceId,
      input.stateId,
    );
    if (!active) return undefined;
    if (!this.mention(active, input.componentIdentity, input.mentionId)) {
      throw new InvalidCitationResolutionError();
    }
    const component = active.reading.components.find(
      (candidate) => candidate.identity === input.componentIdentity,
    );
    if (!component) throw new InvalidCitationResolutionError();
    const target = this.target(component, input.mentionId);
    const current = (
      await readCitationResolutionsInSnapshot(
        database,
        input.sourceId,
        input.stateId,
      )
    ).find(
      (item) =>
        item.componentIdentity === input.componentIdentity &&
        item.mentionId === input.mentionId,
    );
    if (!current) return false;
    const inserted = await database
      .insert(citationResolutions)
      .values({
        sourceStateId: input.stateId,
        derivativeId: active.derivativeId,
        componentIdentity: input.componentIdentity,
        mentionId: input.mentionId,
        bibliographyComponentIdentity: null,
        bibliographyEntryId: null,
        ...target,
        actorId: input.actorId,
        action: "cleared",
        method: "manual",
      })
      .returning({ id: citationResolutions.id });
    return inserted.length === 1;
  }

  private mention(
    active: Awaited<
      ReturnType<DrizzleCitationResolutionStore["activeReading"]>
    > &
      object,
    componentIdentity: string,
    mentionId: string,
  ) {
    return deriveCitationMentionEvidence({
      derivativeId: active.derivativeId,
      reading: active.reading,
      rightsBasis: active.rightsBasis,
      sensitivityLevel: active.sensitivityLevel,
    }).find(
      (item) =>
        item.componentIdentity === componentIdentity &&
        item.mentionId === mentionId,
    );
  }

  private target(
    component: Parameters<typeof authoredTargetForPublisherAnchor>[0],
    mentionId: string,
  ): AuthoredTarget {
    try {
      return authoredTargetForPublisherAnchor(component, mentionId);
    } catch (error) {
      if (error instanceof InvalidAuthoredTargetError) {
        throw new InvalidCitationResolutionError(
          "Citation mention evidence is unavailable",
        );
      }
      throw error;
    }
  }

  private async activeReading(sourceId: string, stateId: string) {
    const active = await this.activeReadingDerivatives.read({
      sourceId,
      stateId,
    });
    return active.status === "active"
      ? {
          derivativeId: active.value.derivativeId,
          reading: active.value.reading,
          rightsBasis: active.value.policy.rightsBasis,
          sensitivityLevel: active.value.policy.sensitivityLevel,
        }
      : undefined;
  }
}

function serializeSelectedResolution(
  resolution: typeof citationResolutions.$inferSelect,
  sourceId: string,
): CitationResolutionRecord {
  if (
    resolution.action !== "selected" ||
    resolution.bibliographyComponentIdentity === null ||
    resolution.bibliographyEntryId === null
  ) {
    throw new InvalidCitationResolutionError();
  }
  const { action: _action, ...record } = resolution;
  return {
    ...record,
    sourceId,
    bibliographyComponentIdentity: resolution.bibliographyComponentIdentity,
    bibliographyEntryId: resolution.bibliographyEntryId,
    offsetBasis:
      resolution.offsetBasis as CitationResolutionRecord["offsetBasis"],
    method: resolution.method as CitationResolutionRecord["method"],
    createdAt: resolution.createdAt.toISOString(),
    updatedAt: resolution.updatedAt.toISOString(),
  };
}
