import type { db } from "@lirna/db";
import { citationResolutions } from "@lirna/db/schema/citation-resolutions";
import { sourceStates } from "@lirna/db/schema/sources";
import { and, asc, eq } from "drizzle-orm";

import type { ActiveReadingDerivativeOperations } from "../sep-admission/active-reading-derivative";
import { DrizzleActiveReadingDerivativeStore } from "../sep-admission/active-reading-derivative-store";
import { deriveCitationMentionEvidence } from "./citation-mention-evidence";
import type {
  CitationResolutionDecision,
  CitationResolutionOperations,
  CitationResolutionRecord,
  ClearCitationResolutionInput,
  CreateCitationResolutionInput,
} from "./citation-resolution-contract";

export class InvalidCitationResolutionError extends Error {
  constructor(message = "Citation mention or candidate is unavailable") {
    super(message);
    this.name = "InvalidCitationResolutionError";
  }
}

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
    const decisions = await this.history(sourceId, stateId);
    const latest = new Map<string, CitationResolutionDecision>();
    for (const decision of decisions) {
      latest.set(decisionKey(decision), decision);
    }
    return [...latest.values()]
      .filter(isSelectedDecision)
      .toSorted(
        (left, right) =>
          left.componentIdentity.localeCompare(right.componentIdentity) ||
          left.mentionId.localeCompare(right.mentionId),
      );
  }

  async history(sourceId: string, stateId: string) {
    const rows = await this.database
      .select({
        resolution: citationResolutions,
        sourceId: sourceStates.sourceId,
      })
      .from(citationResolutions)
      .innerJoin(
        sourceStates,
        eq(sourceStates.id, citationResolutions.sourceStateId),
      )
      .where(
        and(eq(sourceStates.id, stateId), eq(sourceStates.sourceId, sourceId)),
      )
      .orderBy(asc(citationResolutions.createdAt), asc(citationResolutions.id));
    return rows.map(({ resolution, sourceId }) =>
      serializeDecision(resolution, sourceId),
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
    const active = await this.activeReading(input.sourceId, input.stateId);
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
    validateMethod(input);
    const anchor = mentionAnchor(component.plainText, mention.label);

    const [resolution] = await this.database
      .insert(citationResolutions)
      .values({
        sourceStateId: input.stateId,
        derivativeId: active.derivativeId,
        componentIdentity: input.componentIdentity,
        mentionId: input.mentionId,
        bibliographyComponentIdentity: candidate.bibliographyComponentIdentity,
        bibliographyEntryId: candidate.bibliographyEntryId,
        publisherAnchor: input.mentionId,
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: anchor.start,
        normalizedEndOffset: anchor.end,
        exactText: mention.label,
        prefix: anchor.prefix,
        suffix: anchor.suffix,
        actorId: input.actorId,
        action: "selected",
        method: input.method,
        confidence: input.confidence ?? null,
        reasoning: input.reasoning ?? null,
      })
      .returning();
    if (!resolution) return undefined;
    const decision = serializeDecision(resolution, input.sourceId);
    if (!isSelectedDecision(decision)) {
      throw new InvalidCitationResolutionError();
    }
    return selectedRecord(decision);
  }

  async clear(input: ClearCitationResolutionInput) {
    const active = await this.activeReading(input.sourceId, input.stateId);
    if (!active) return undefined;
    if (!this.mention(active, input.componentIdentity, input.mentionId)) {
      throw new InvalidCitationResolutionError();
    }
    const current = (await this.list(input.sourceId, input.stateId)).find(
      (item) =>
        item.componentIdentity === input.componentIdentity &&
        item.mentionId === input.mentionId,
    );
    if (!current) return false;
    const inserted = await this.database
      .insert(citationResolutions)
      .values({
        sourceStateId: input.stateId,
        derivativeId: active.derivativeId,
        componentIdentity: input.componentIdentity,
        mentionId: input.mentionId,
        bibliographyComponentIdentity: null,
        bibliographyEntryId: null,
        publisherAnchor: current.publisherAnchor,
        offsetBasis: current.offsetBasis,
        normalizedStartOffset: current.normalizedStartOffset,
        normalizedEndOffset: current.normalizedEndOffset,
        exactText: current.exactText,
        prefix: current.prefix,
        suffix: current.suffix,
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

function validateMethod(input: CreateCitationResolutionInput) {
  if (input.method === "manual") {
    if (input.confidence !== undefined || input.reasoning !== undefined) {
      throw new InvalidCitationResolutionError(
        "Manual decisions cannot include inference metadata",
      );
    }
    return;
  }
  if (
    input.confidence === undefined ||
    input.confidence < 0 ||
    input.confidence > 1 ||
    !input.reasoning?.trim()
  ) {
    throw new InvalidCitationResolutionError(
      "Inferred decisions require confidence and reasoning",
    );
  }
}

function mentionAnchor(plainText: string, label: string) {
  const start = plainText.indexOf(label);
  if (start < 0) {
    throw new InvalidCitationResolutionError(
      "Citation mention evidence is unavailable",
    );
  }
  const end = start + label.length;
  return {
    start,
    end,
    prefix: plainText.slice(Math.max(0, start - 32), start),
    suffix: plainText.slice(end, end + 32),
  };
}

function serializeDecision(
  resolution: typeof citationResolutions.$inferSelect,
  sourceId: string,
): CitationResolutionDecision {
  return {
    ...resolution,
    sourceId,
    action: resolution.action as CitationResolutionDecision["action"],
    offsetBasis:
      resolution.offsetBasis as CitationResolutionDecision["offsetBasis"],
    method: resolution.method as CitationResolutionDecision["method"],
    createdAt: resolution.createdAt.toISOString(),
    updatedAt: resolution.updatedAt.toISOString(),
  };
}

function decisionKey(decision: CitationResolutionDecision) {
  return `${decision.componentIdentity}\u0000${decision.mentionId}`;
}

function isSelectedDecision(
  decision: CitationResolutionDecision,
): decision is CitationResolutionDecision & {
  action: "selected";
  bibliographyComponentIdentity: string;
  bibliographyEntryId: string;
} {
  return (
    decision.action === "selected" &&
    decision.bibliographyComponentIdentity !== null &&
    decision.bibliographyEntryId !== null
  );
}

function selectedRecord(
  decision: CitationResolutionDecision & {
    bibliographyComponentIdentity: string;
    bibliographyEntryId: string;
  },
): CitationResolutionRecord {
  const { action: _action, ...record } = decision;
  return record;
}
